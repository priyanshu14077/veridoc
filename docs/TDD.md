# Technical Design Document: Crosscheck

**GitHub:** `https://github.com/<user>/crosscheck` *(fill in)* · **Live app:** *(fill in after deploy)*
Version 0.1 · 2026-11-02 · Author: Priyanshu Kumar · Companion to [PRD.md](./PRD.md)

> Assumptions carry the PRD's tags **[A#]**. New ones introduced here start at **[A14]**. Sections marked *(fill after build)* will be finished with measured numbers before submission.

---

## 1. What it is

A web app for a customs broker's documentation team. It takes a shipment's invoice, packing list and bill of lading, extracts the fields with a vision AI model, scores each field's confidence, cross-checks the three documents against each other, and exports a filing-ready CSV once a person has cleared every uncertain or conflicting value.

The core rule behind the design: **the AI proposes and a person disposes.** The export gate is enforced by the server, it is computed from the data rather than stored as a flag, and it is covered by tests.

## 2. Architecture

```
 Browser (Next.js app)
   │  same origin: /api/* is rewritten to FastAPI, so there is no CORS and the cookie is first-party
   ▼
 Next.js (web) ──► FastAPI (api) ──► Postgres  (data + job queue + sessions + audit)
                       │   ▲
                       │   └── worker process (same Python codebase)
                       │          │  claims jobs with SELECT … FOR UPDATE SKIP LOCKED
                       │          ├─► Gemini API (vision extraction, JSON schema output)
                       ▼          ▼
                   Object storage (local disk in dev, S3 ap-south-1 in prod)
```

| Component | Choice | Why | Rejected |
|---|---|---|---|
| Frontend | Next.js (App Router, TypeScript), Tailwind with custom tokens, Radix primitives, TanStack Query, pdf.js | Fast to build a polished UI. Radix gives accessible behaviour without a default look. Query handles polling and caching | Plain shadcn defaults (looks generic) |
| API | FastAPI + Pydantic v2 + SQLAlchemy 2 | Python suits PDF and image handling and the Gemini SDK. Pydantic models give one source for request validation **and** the AI output schema | Node API: we'd validate the same shapes twice |
| Job queue | A Postgres `jobs` table + worker process | One fewer service (no Redis/Celery). The queue is transactional with the data. 1,100 shipments a month is about 3,300 jobs, far below where Postgres queues struggle | Celery + Redis: more infrastructure for no gain at this volume |
| Database | Postgres 16 | Relational data, JSONB for raw AI output, row locks for the queue | |
| Storage | `Storage` interface: local driver (dev) and S3 driver (prod) | Runs with zero setup locally. In prod, a private bucket in Mumbai | MinIO in dev: one more container to start |
| AI | Gemini `gemini-3.5-flash` (set by `GEMINI_MODEL`, with fallbacks) through the `google-genai` SDK | Free tier available (the client's constraint for this build). Native PDF input. JSON schema output. Same SDK as Vertex AI, so moving to Vertex is a config change | OCR + LLM (decided against in the PRD: more to build in 14 h) |
| Auth | Server-side sessions in Postgres, argon2id password hashes, httpOnly cookie | Simple to reason about, can be revoked, no JWTs in localStorage | Auth SaaS: an outside dependency plus data outside India |

**Why one API plus one worker rather than microservices:** a 14-person team at a single site needs one deployable unit. The worker is a second process running the same code. It exists only so a slow AI call never holds up an HTTP request.

## 3. Data model

```
users ─┐
       ├─< sessions
       └─< audit_log (actor)
importers ─< shipments >─ suppliers
                │  └── assignee → users
                ├─< documents ─< extraction_runs
                │       └─< fields
                ├─< check_results
                └─< exports
jobs (queue, references documents)
```

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, email (unique), name, role `executive\|manager`, password_hash, is_active | |
| `sessions` | id, token_hash, user_id, expires_at, last_seen_at | Only a hash of the cookie token is stored |
| `importers` | id, name, iec_code, contact_name, contact_phone, contact_email | **Personal data.** Masked in API responses unless the caller is allowed to see it (§8) |
| `suppliers` | id, name, country | Used for accuracy by supplier |
| `shipments` | id, ref (`SHP-24811`, unique), importer_id, supplier_id, assignee_id, status, created_by, timestamps | `status` is **cached** output of `recompute_status()` and never set directly |
| `documents` | id, shipment_id, doc_type `invoice\|packing_list\|bill_of_lading`, file_key, file_name, mime, size_bytes, sha256, page_count, extraction_status `pending\|running\|done\|failed\|manual`, detected_type, error | One active document per type per shipment. Uploading a new one supersedes the old |
| `extraction_runs` | id, document_id, model, prompt_version, attempt, status, raw_response JSONB, latency_ms, tokens_in, tokens_out, error | Every AI call can be reproduced from this row |
| `fields` | id, document_id, key, line_index (null for header fields), value, normalized JSONB, ai_value, model_confidence, confidence, validator_errors[], status `ai\|confirmed\|edited\|manual`, page, bbox, version, updated_by, updated_at | One table holds header and line fields: `(key='qty', line_index=2)`. `version` gives optimistic locking |
| `check_results` | id, shipment_id, rule_id, status `pass\|fail\|not_checkable`, inputs JSONB, inputs_hash, message, accepted_by, accept_reason, accepted_at | An acceptance holds only while `inputs_hash` is unchanged (§5.4) |
| `exports` | id, shipment_id, version, format, file_key, sha256, row_count, created_by, created_at | Kept forever. A reopen leads to v2 |
| `audit_log` | id, actor_id, entity, entity_id, action, before JSONB, after JSONB, reason, created_at | Append-only. Holds field edits, confirmations, acceptances, exports, reopens and **each reveal of personal data** |
| `jobs` | id, kind, payload JSONB, status, attempts, run_after, locked_at, last_error | |

**Flags are not stored.** A flag is one of:
- a field with `confidence < threshold` and `status = 'ai'`;
- a required field that is still null;
- a `check_results` row with status `fail` or `not_checkable` that has no valid acceptance;
- a document with `extraction_status` of `failed` or `pending`.

`open_flags(shipment)` is one query. Export, status and the UI all read from it, so they can't drift apart.

**Status machine** (computed by `recompute_status()` after every write):

```
draft ──upload──► extracting ──all docs done──► needs_review ◄──┐
                                       │   (no open flags)      │ edit/new upload
                                       └──────► cleared ────────┘
                                                  │ export
                                                  ▼
                                               exported ──manager reopen──► needs_review
```

## 4. Main flows (sequence)

**Upload → extraction**
1. `POST /api/shipments/{id}/documents` (multipart). The server checks the magic bytes (`%PDF`, PNG, JPEG), size ≤ 15 MB [A5] and page count ≤ 10. It stores the file under a random key, inserts a `documents` row and a `jobs` row in **the same transaction**, and returns 202.
2. The worker claims the job, sets the document to `running` and calls Gemini (§5). It parses and checks the response, normalises and scores every field, writes `fields` and the `extraction_runs` row, and sets the document to `done`.
3. When all present documents are done, it runs the cross-check engine, writes `check_results` and runs `recompute_status()`.
4. The UI polls `GET /api/shipments/{id}` every 2 s while anything is `extracting`, using TanStack Query's `refetchInterval` (switched off once nothing is extracting).

**Review edit**
`PATCH /api/fields/{id}` with `{value, version}` → validate → normalise → update with `version+1` (409 on a version mismatch) → audit row → **rerun only the rules that read this field** → `recompute_status()` → return the updated field, checks and flag count. The UI applies this response directly, so a correction gives instant feedback.

**Export**
`POST /api/shipments/{id}/export` → `open_flags()` inside the transaction → if any are open, return 409 `{blockers: [...]}`. Otherwise build the CSV, store it, insert an `exports` row, set status to `exported`, add an audit row, and return the file.

## 5. The AI part

### 5.1 Extraction call
- **One call per document.** The PDF bytes are sent inline (images are downscaled to 2,000 px on the long edge). The prompt is specific to the document type, and a `response_schema` is generated from the Pydantic model for that type.
- Every extracted value in the schema is wrapped like this:
  ```json
  {"value": "3165", "confidence": 0.92, "page": 1, "box_2d": [412, 610, 436, 702]}
  ```
  `box_2d` is Gemini's normalised 0–1000 `[ymin, xmin, ymax, xmax]`. It's best effort and used only for highlighting (P1).
- The model also returns `detected_doc_type`, `languages[]` and `pages[{page, readable: bool, reason}]`.
- The prompt tells the model to: copy values exactly as printed (normalisation is our job, not the model's); return null rather than guess; lower confidence when text is stamped over, handwritten or blurred; read bilingual documents (e.g. Chinese + English) using the English value where both are printed.
- `prompt_version` and `model` are stored on every run. Prompts live in `api/app/extraction/prompts/` as versioned files.

### 5.2 Normalisation (deterministic, unit-tested)
- Numbers: strip thousands separators and units (`3,165 KGS` → `3165`). Handle the European decimal comma when the supplier country uses it (`42,50` → `42.50`) **[A14]**.
- Dates: parse with a day-first preference for non-US suppliers **[A15]** and store as ISO.
- Container numbers: uppercase, strip spaces and hyphens.
- Party names: lowercase, strip legal suffixes (`co., ltd`, `pvt ltd`, `ab`, `gmbh`), collapse whitespace.

### 5.3 Confidence
```
score = model_confidence                 # self-reported; trusted only to lower the score
if validator fails → score = min(score, 0.4)
if required and null → score = 0
flag if score < THRESHOLD                # 0.85 to start [A6]; tuned in §5.6
```
Validators: date range [A7], 8-digit HSN, ISO 6346 container check digit, ISO 4217 currency, Incoterms 2020 list, positive quantities and weights, and **a detected document type that differs from the chosen one** (a document-level warning).

### 5.4 Cross-check engine
- Lives in `api/app/checks/`. Each rule is a pure function `(ShipmentView) -> CheckResult`, with no I/O and no AI. All arithmetic uses `Decimal`.
- Rules X1–X10 and their tolerances are as in PRD §8.3. Each rule declares the field keys it reads, so an edit reruns only the rules affected.
- **Matching lines for X3 (invoice ↔ PL quantities):** match by HSN first, then by description similarity (rapidfuzz `token_set_ratio ≥ 85`). Lines left unmatched on either side fail the rule and are listed.
- **Missing input → `not_checkable`.** This is a flag, never a silent pass.
- **Acceptance validity:** an acceptance stores `inputs_hash`. If anyone later edits an input, the hash changes and the acceptance no longer counts. This stops the case where someone accepts a mismatch and then edits the value to something new nobody reviewed.

### 5.5 When the AI is wrong or unavailable
| Case | Detection | Behaviour |
|---|---|---|
| Wrong value, model unsure | score < threshold | Field flagged amber. Confirm or Edit |
| Wrong value, model confident | Validator fails or a cross-check fails | Flagged. This is why the checks exist |
| Wrong value, confident, passes every check | Not detectable by design | Measured as **unflagged error rate** in the eval (§5.6) and reported honestly |
| Unreadable page | `readable=false`, or ≥ 70% of required fields null **[A16]** | Document set to `manual`. Empty fields beside the image |
| Invalid JSON or schema mismatch | Pydantic validation | Retried like a 5xx, then `failed` |
| 503 / 504 / timeout | SDK error | Next model in `GEMINI_FALLBACK_MODELS` at once; if all fail, backoff 5 s → 20 s → 60 s (3 attempts), then `failed` with **Retry** and **Enter by hand** |
| 429 quota exhausted | SDK error with Google's `RetryInfo` | Next model (each has its own quota). If every model is out, the job waits until the provider's reset time **without spending an attempt**, and the document shows "Daily AI limit reached, retrying at HH:MM IST" with **Enter by hand** |
| User picks manual entry while a job waits, or replaces the file mid-call | Worker re-reads the document under `FOR UPDATE` before saving | Queued job is cancelled; an in-flight result is discarded, never written over manual work |
| Prompt injection in document text | Model has no tools. Output is schema-bound and treated as data | At worst a wrong value, which is caught like any other wrong value |
| Wrong document type uploaded | `detected_doc_type` ≠ chosen type | Warning with a one-click "change type" |

### 5.6 Evaluation
- `scripts/generate_docs.py` renders invoice, PL and B/L PDFs from a JSON spec, with "scanned" variants: rotated 1–4°, Gaussian noise, JPEG artefacts, a stamp overlay, and one Chinese + English set. **The spec is the ground truth**, so labels are exact.
- `scripts/record_fixtures.py` runs real Gemini extraction on every sample and saves the raw output; `scripts/eval.py` scores those recordings against the ground truth. It reports:
  - **field accuracy**: normalised value == truth, per field and overall;
  - **flag recall**: of the fields that are wrong, the share that are flagged. This is the safety metric;
  - **unflagged error rate**: wrong and not flagged, out of all fields. The aim is ≤ 1%;
  - **review load**: flagged fields per shipment. This drives the client's 15-minute target.
- **Choosing the threshold:** the lowest threshold that keeps the unflagged error rate ≤ 1%. The trade-off table goes here.
- **First results (2026-11-02, 18 documents / 291 fields, `gemini-3.5-flash`):** 291/291 fields correct after normalisation. The first run scored 287/291, and all 4 misses were *our* normaliser bugs (country casing, "360 BUNDLES" as a number), not model errors; both were fixed with tests.
- **Full set (2026-11-02, 34 readable documents / 536 fields; 31 by `gemini-3.5-flash`, 2 by `gemini-3.5-flash-lite` and 1 by `gemini-3.8-flash` after fallbacks):** 535/536 correct (99.8%). The unreadable B/L (SHP-24820) went to manual entry as designed. Unflagged error rate 0.19%, inside the 1% aim, at every threshold from 0.50 to 0.98, so 0.85 stays.
- **Finding: the one miss was confidently wrong.** On SHP-24822's packing list the model returned "as per marks" (the text in the Dimensions column) as the *shipping marks*, at confidence 1.0; the real marks ("CO-G / BHIWANDI") are printed lower on the page. No threshold flags this. Shipping marks aren't cross-checked against another document, so today only the reviewer can catch it. Next steps: a prompt hint that marks are never a table cell, and a cross-check against the B/L's marks field if one is added.
- **Finding: self-reported confidence doesn't catch the hard case.** On SHP-24817 a rubber stamp covers the invoice total. The model read it correctly but reported 0.95 confidence, the same as clean text. A threshold can't separate "covered by a stamp" from "clean" if the model doesn't. This is the strongest argument for the deterministic cross-checks: they catch a wrong value regardless of how confident the model is.
- Limitation stated up front: synthetic documents are cleaner than real scans, so these numbers are an upper bound. The real 200-shipment check is the first step after go-live.

### 5.7 Provider, privacy and cost
- **Demo:** free-tier Gemini API key, **synthetic data only** [A11]. The free tier's terms allow Google to use submitted content to improve its products, so the free tier must never see real client documents.
- **Production design:** the same SDK pointed at **Vertex AI** (`GOOGLE_GENAI_USE_VERTEXAI=true`) in an Indian region. Vertex AI's terms say customer data is not used for training. *Check available models in `asia-south1` before final submission.*
- **Measured tokens:** about 1,060–1,140 input tokens per one-page document, output 350–1,990; latency 4–24 s (median about 13 s) across 35 calls. Cost at the client's volume = 3,300 documents/month × these tokens × the paid price for the chosen model *(fill in from the current price list)*.
- **Free tier is capped at 20 requests per model per day** (Google's `GenerateRequestsPerDayPerProjectPerModel-FreeTier`; the `gemini-3.5-flash` alias counts against `gemini-3.6-flash`). That's about 6 shipments a day per model. The worker falls back across models (each has its own quota) and then waits for the reset (§5.5). The worker also paces calls with `GEMINI_RPM`. Seed shipments replay recorded real extractions, so the demo doesn't spend quota. Production needs a paid tier, which also removes the training-on-data concern.

## 6. API surface

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/api/auth/login` · `/logout` · GET `/me` | any | Login is rate-limited (5 tries per minute per IP and email) |
| GET | `/api/shipments?status&supplier&assignee&q&page` | exec: own + unassigned · mgr: all | |
| POST | `/api/shipments` | both | |
| GET | `/api/shipments/{id}` | scoped | Documents, fields, checks, open flags |
| POST | `/api/shipments/{id}/documents` | scoped | multipart, returns 202 |
| GET | `/api/documents/{id}/file` | scoped | Streamed by the API after an auth check. No public URLs |
| POST | `/api/documents/{id}/retry` · `/manual` | scoped | |
| GET | `/api/documents/{id}` | scoped | Fields with flags, plus `read_only_reason` (exported, replaced, still being read) |
| PATCH | `/api/fields/{id}` | scoped | `{value, version}` or `{action:"confirm", version}`. 409 with the winning value on a version mismatch. 422 if the value doesn't parse as the field's type **[A19]** |
| POST · DELETE | `/api/documents/{id}/lines` · `/lines/{line_index}` | scoped | Add an empty line item / remove one. The last line can't be removed **[A20]** |
| POST | `/api/checks/{id}/accept` | scoped | `{reason}` of at least 10 characters |
| POST | `/api/shipments/{id}/export` | scoped | 409 with blockers |
| GET | `/api/shipments/{id}/exports` | scoped | |
| POST | `/api/shipments/{id}/reopen` | manager | |
| GET | `/api/importers/{id}/contact` | scoped | Unmasked. Logs a reveal |
| GET | `/api/fields/{id}/history` | scoped | From `audit_log`, newest first, with names |
| GET | `/api/reports/accuracy?group=field\|supplier` · `/overrides` | manager | P1 |

"Scoped" means one dependency, `require_shipment_access(user, shipment)`, used on every route that loads a shipment or one of its children. A test checks every route against both roles.

## 7. Export layout [A3]

A single UTF-8 CSV with a BOM (Excel opens it correctly). The `record_type` column splits header and lines:

- **H row:** `record_type=H, shipment_ref, importer_name, importer_iec, supplier_name, supplier_country, invoice_no, invoice_date (DD/MM/YYYY), currency, incoterm, incoterm_place, invoice_value, bl_no, vessel_voyage, port_of_loading, port_of_discharge, total_packages, package_type, gross_weight_kg, net_weight_kg, container_nos (; separated)`
- **L rows:** `record_type=L, shipment_ref, line_no, description, hsn, qty, unit, unit_price, line_amount, country_of_origin`

The layout is one mapping module (`api/app/export/layout.py`), so the real filing-software layout can replace it in one file. **CSV injection guard:** a cell starting with `= + - @` or a tab gets a leading `'`.

## 8. Security and privacy

| Concern | Control |
|---|---|
| Secrets | `.env` is git-ignored. `.env.example` has names only. A gitleaks pre-commit hook |
| Auth | argon2id. 32-byte random session token, stored hashed. Cookie `HttpOnly; Secure; SameSite=Lax`. 12 h idle expiry |
| CSRF | SameSite=Lax, plus an `Origin` header check on unsafe methods |
| Access control | Role + ownership dependency on every route. Tests for each route and role |
| Input validation | Pydantic on every body and query. Enum and length limits. Field edits validated against the field's type |
| Uploads | Magic-byte check, size and page limits, random storage keys, never served from a public path |
| Personal data (DPDP) | Importer contact masked by default (`R*** K***`, `+91 ••••• ••321`). Revealed only to the assignee or a manager, and each reveal is logged. The seed data is fictional |
| Confidential prices | Same scoping. Executives don't see shipments they aren't assigned to (apart from unassigned ones) |
| Data residency | Production: S3 + Postgres in ap-south-1. AI on Vertex in an Indian region (§5.7) |
| Audit | Append-only `audit_log`. The app's DB role has no UPDATE or DELETE on it **[A17]** |

## 9. UI and design decisions

**Principles.** Calm, dense and quiet. Colour is used only for state. Every screen answers "what needs me next?"

- **Type:** IBM Plex Sans for the UI, IBM Plex Mono with tabular figures for every number, code and ID. Customs data is mostly numbers, and aligned digits make a mismatch like 3,120 vs 3,165 visible at a glance.
- **Palette:** neutral grey ink on near-white, one accent (deep blue) for primary actions. State colours: **amber = unsure**, **red = conflict**, **green = cleared**. Each always comes with an icon and a label (never colour alone).
- **Spacing:** 4 px base. Table rows 36 px. Generous page margins, tight data.

**Key screens**
- **Shipment list:** a table, not cards. Columns: ref, supplier, importer, status chip, open flags (count with colour), assignee, updated. Filters sit in one row. Phone: rows collapse to two-line items.
- **Review (the main screen):** a split view, document 60% / fields 40%, which can be resized.
  - Fields are grouped by section (Parties, Invoice, Shipping, Lines), with flagged fields **sorted into a "Needs you" group at the top**.
  - Each flagged row shows the reason inline ("Low confidence 0.62" or "PL says 3,165 kg").
  - One-click actions: ✓ Confirm, ✎ Edit (inline), "Accept with reason" on conflicts.
  - Keyboard: `J`/`K` next/previous flag, `Enter` confirm, `E` edit, `Esc` cancel. Focusing a field jumps the viewer to its page and highlights its box (P1).
  - A header progress bar ("3 of 7 flags left") and an Export button that is disabled with a reason until everything is clear.
- **Cross-checks:** one row per rule, with a value column per document, so a disagreement reads left to right. Tolerance is shown, so a small accepted difference makes sense.
- **Export:** the blockers listed as links straight to the flag. When clear, a row preview and the download.
- **States:** skeleton loaders that match the final layout. Empty states with one next action ("No shipments yet. Create one"). Errors that say what happened and offer Retry.

*(Add screenshots after build.)*

## 10. Testing

| Layer | What | Tool |
|---|---|---|
| Unit | All 10 cross-check rules (pass, fail, edge of tolerance, missing input) · line matching · confidence scoring · each validator (incl. the ISO 6346 check digit) · normalisers (European decimals, units, dates) · CSV injection escape | pytest |
| Domain | `open_flags()` and `recompute_status()` across state combinations · acceptance invalidated when inputs change · optimistic lock conflict | pytest + test Postgres |
| API | Export returns 409 with flags open · permission tests for each route and role · upload rejects a fake PDF (wrong magic bytes) · personal data masked for a non-assignee | pytest + httpx |
| AI | Extraction with a recorded Gemini response (no network in CI) · invalid JSON → retry → failed · 429 → backoff | pytest |
| Eval | Accuracy and flag recall on 20 synthetic shipments | `make eval` (manual, needs a key) |
| E2E (stretch) | Sign in → review → resolve → export | Playwright |

CI: GitHub Actions runs lint (ruff, eslint), type checks (mypy-lite, tsc) and tests on every push.

## 11. Repository layout

```
crosscheck/
├─ api/                 FastAPI app + worker (python -m app.worker)
│  ├─ app/{auth,shipments,documents,extraction,checks,export,reports,audit}/
│  ├─ migrations/       hand-written SQL migrations
│  └─ tests/
├─ web/                 Next.js app
├─ scripts/             generate_docs.py, seed.py, eval.py
├─ sample-docs/         generated PDFs used by the seed (synthetic)
├─ docs/                PRD.md, TDD.md, deployment.md
└─ docker-compose.yml   postgres (+ api, worker, web for one-command run)
```

## 12. Build plan (about 14 h)

| Day | Deliverable | Commit boundary |
|---|---|---|
| 1 | Scaffold, compose, schema migration, auth, seed users | `feat: auth and schema` |
| 2 | Doc generator, upload, storage, job queue, Gemini extraction | `feat: extraction pipeline` |
| 3 | Review screen: viewer + fields + edit + confirm | `feat: review screen` |
| 4 | Cross-check engine + tests, acceptance | `feat: cross-checks` |
| 5 | Export gate + CSV, list filters, history | `feat: export` |
| 6 | States, phone layout, accuracy report, deploy | `feat: polish + deploy` |
| 7 | Eval run, fill in TDD numbers and screenshots, deployment.md, submit | `docs: TDD` |

## 13. What was cut, and what's next

**Cut for time:** importer portal and email ingestion · supplier templates that learn from corrections · OCR layer with real word-level confidence and bounding boxes · deskew/denoise pre-processing · bulk upload · notifications · SSO · the real filing-software layout (one file to change) · Hindi/other-language UI.

**Next, in order:**
1. Run the eval on the client's 200 real shipments on Vertex (India). Recalibrate the threshold.
2. Add an OCR pass (e.g. Document AI) as a second opinion on the fields that matter most: total, weights, quantity. Disagreement becomes a flag.
3. Per-supplier priors: a supplier whose field gets corrected often has the confidence for that field lowered automatically.
4. Importer query loop: send a doubt to the importer and track the reply against the field.
5. Load the real filing-software import layout.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Free-tier quota or a model change during the review | Seeds come pre-extracted. Model set by env var. Clear failed and manual-entry states |
| The model is confidently wrong | Validators + cross-checks. The unflagged error rate is measured and reported, not hidden |
| 14-hour budget | P0 only is promised. P1 cut from the bottom |
| Synthetic eval flatters accuracy | Stated as a limitation. Next step is the real-data eval |

## 15. Assumptions added in this document

| # | Assumption |
|---|---|
| A14 | Suppliers from decimal-comma countries (e.g. Sweden) may print `42,50`. The parse rule depends on the supplier's country |
| A15 | Dates are read day-first unless the supplier is in the US |
| A16 | ≥ 70% of required fields null means the page is effectively unreadable |
| A17 | The audit log is protected at the database-role level in production. Locally, one role is used |
| A18 | Managers can correct fields too. Their edits are audited like anyone's. *Alternative: managers are read-only until they reopen* |
| A19 | A person's value must parse as the field's type (a number, a date) so cross-checks and export can use it. Other format warnings (an HSN that isn't 8 digits, a container check digit) are shown but don't block the save, since the document may really say that |
| A20 | Every invoice and packing list keeps at least one line item. A document with no lines can't be exported |
| A21 | After a person confirms or edits a field, its AI confidence no longer decides whether it's flagged. Only an empty required value is |
