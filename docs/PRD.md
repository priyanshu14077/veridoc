# PRD: Veridoc: AI document extraction and cross-check for import shipments

Status: Draft v0.1 (2026-11-02) · Owner: Priyanshu Kumar · Brief: isokode take-home, problem statement #2

> Every assumption is tagged **[A#]** and listed in §12. Anything not in the client brief is an assumption.

---

## 1. Summary

Company A is a customs broker at Nhava Sheva. Its documentation team retypes importer PDFs (invoice, packing list, bill of lading) into an Excel checklist and then into its customs filing software. Veridoc replaces the retyping. An executive drops a shipment's three documents in, a vision AI model extracts the fields with a confidence score on each, and the system checks the three documents against each other. The executive confirms every uncertain or conflicting field beside the source page, then exports a file in the filing software's import layout. The filing software stays as it is.

## 2. Problem and goals

From the brief:

| Cost today | Numbers | ₹ / year |
|---|---|---|
| Data entry | 1,100 shipments/month × 45 min × ₹350/h × 12 | 34.65 lakh |
| Errors forcing an amended Bill of Entry or a port delay | 3% of 13,200 = 396 × ₹9,000 | 35.64 lakh |
| **Total** | | **70.29 lakh** |

**Client success metrics:** entry time per shipment from 45 min to under 15 min. 95% field accuracy on 200 past shipments. Amended Bills of Entry halved within 3 months.

**What this build proves (take-home scope):**
- G1: a shipment goes from upload to export end to end, on realistic sample documents.
- G2: no export while any low-confidence field or failed cross-check is uncleared. This holds at the API, not only in the UI.
- G3: a reproducible accuracy report on a labelled synthetic set (§11), as a stand-in for the 200-shipment target.
- G4: every human correction is logged with who, when, old value and new value.

## 3. Users and roles

| Role | Who | Core job |
|---|---|---|
| Documentation executive | 14-person team | Creates shipments, uploads documents, reviews and corrects fields, resolves cross-checks, exports |
| Documentation manager | Team lead | Sees every shipment, reviews overrides, reopens shipments, reads the accuracy report |
| Importer | External | **Out of the core build.** Documents are uploaded on their behalf **[A1]** |

### Permission matrix

| Action | Executive | Manager |
|---|---|---|
| View shipment list | Own and unassigned **[A2]** | All |
| Create shipment, upload documents | ✓ | ✓ |
| Edit fields, resolve flags | Own shipments | All |
| Accept a mismatch with a reason (override) | ✓ | ✓ |
| Export | ✓ (once cleared) | ✓ |
| Reopen an exported shipment | ✗ | ✓ |
| Accuracy report, overrides log | ✗ | ✓ |
| See unmasked importer contact details | Assigned shipments only | ✓ |

Decision D1 (§13): the executive exports, per the client's answer. The manager's "approves" from the brief becomes **review of overrides after the fact, with the power to reopen**.

## 4. Scope

### P0: core slice (must work end to end)
1. Sign-in with the two roles.
2. Shipment list with status, filters and search.
3. Create a shipment and upload an invoice, packing list and B/L (PDF, JPG or PNG).
4. AI extraction with a confidence score on every field.
5. Side-by-side review: document viewer on one side, fields on the other, uncertain fields highlighted, one-click actions.
6. Cross-checks across the three documents, with resolution (correct the field, or accept with a reason).
7. Export gate, then CSV export in the assumed filing layout **[A3]**.
8. Seed data: 12 shipments in mixed states, so no screen is empty.
9. Loading, empty and error states on every screen. Layout usable on a phone (§10.5).
10. Tests for cross-checks, confidence scoring and the export gate.

### P1: depth, in priority order (built if time allows)
1. Edit history for each field (the data is captured in P0. This item is the UI).
2. Accuracy report by field and supplier (manager).
3. XLSX export (two sheets) alongside CSV.
4. Field-to-source highlighting, using bounding boxes returned by the model (best effort).
5. Overrides log for the manager.

### Cut (named in the TDD as what we would do next)
Importer portal and adding documents by email · supplier templates that learn from corrections · bulk upload · notifications · SSO.

### Out of scope (from the brief)
Filing on the customs portal · HSN classification or duty calculation · customer tracking portal.

## 5. Time budget (be honest about it)

7 days × 2 h = **about 14 hours** in total. That covers P0 and possibly P1.1–P1.2. Plan:

| Day | Block (2 h) | Exit check |
|---|---|---|
| 1 | Repo, stack scaffold, DB schema, auth, seed script | Sign in as both roles, see the seeded list |
| 2 | Upload, storage, extraction worker, Gemini call with schema | A real PDF upload yields stored fields with confidence |
| 3 | Review screen (viewer + fields + edit) | Correct a field, and the edit is logged |
| 4 | Cross-check engine, resolution UI, unit tests | SHP-24811 flags its weight mismatch, and the tests pass |
| 5 | Export gate, CSV export, edit-history UI | A cleared shipment exports. A blocked one returns a reason |
| 6 | States, phone layout, accuracy report, deploy | Live link works |
| 7 | TDD + deployment.md + buffer | Zip submitted |

When behind schedule, cut from the bottom of P1 first and never from P0.

## 6. Main flows

**F1: New shipment to export (happy path)**
1. The executive clicks **New shipment** and enters an importer and a reference. The system assigns an ID (SHP-xxxxx).
2. They drop up to three files. Each one is tagged as invoice, PL or B/L, either guessed by the AI or picked by hand **[A4]**.
3. Status becomes *Extracting*. The list shows progress. The page doesn't block, and the executive can leave.
4. Extraction finishes. Cross-checks run. Status becomes *Needs review* (any flag) or *Cleared* (none).
5. The executive opens the review screen and works through the flags. Each flag is one click: **Confirm**, **Edit**, or (on a cross-check) **Accept with reason**.
6. When the last flag clears, status becomes *Cleared* and **Export** is enabled.
7. Export downloads the CSV. Status becomes *Exported*, and the file and its hash are stored.

**F2: The AI is wrong or unsure**
- Low-confidence field: highlighted and listed in the flag panel. It can't be exported until someone confirms or edits it.
- Field takes part in a failed cross-check: every field involved on every document is flagged together, with both values shown.
- Unreadable page (the model reports it can't read it, or almost every field comes back null): the page goes to **Manual entry**. Its fields start empty and the image stays beside them.
- AI unavailable (quota, timeout, error): retried with backoff (3 attempts). Then the document is marked *Extraction failed*, with **Retry** and **Enter manually** buttons. The upload is never lost.

**F3: Manager review**
- Overrides log: every accepted mismatch, with reason, user and time. The manager can reopen the shipment.
- Accuracy report: for each field and each supplier, the share of AI values that people did not change.

**F4: Reopen**
- The manager reopens an exported shipment. Status returns to *Needs review*, the earlier export is kept in history, and re-exporting creates a new version.

## 7. Screens (8)

| # | Screen | Purpose | Key states |
|---|---|---|---|
| S1 | Sign in | Email + password, demo accounts listed on the page | Wrong credentials, locked |
| S2 | Shipment list | Status chips, filters (status, supplier, assignee), search, open-flag counts | Empty, loading skeleton, error |
| S3 | New shipment + upload | Three drop zones (invoice / PL / B/L), file checks (type, size ≤ 15 MB **[A5]**) | Uploading, wrong type, too large |
| S4 | Shipment overview | Document cards with extraction status, cross-check summary, timeline | Extracting, failed with Retry |
| S5 | **Review** | Page viewer (zoom, rotate, page switch) beside the field list. Flag panel. Keyboard: J/K for the next flag, Enter to confirm | Manual-entry mode, all clear |
| S6 | Cross-checks | Table of rules: values from each document, tolerance, pass/fail, resolution | All pass |
| S7 | Export | Blockers listed (or none), preview of rows, download CSV | Blocked, exported (version) |
| S8 | Manager: accuracy and overrides (P1) | Accuracy by field and supplier, overrides log | No data yet |

Design brief (from the client): minimal, restrained palette, clear type, nothing on screen without a purpose. The review screen is used all day. Uncertain fields must be obvious at a glance, and every action is one click away. Colour is reserved for state: amber for unsure, red for conflict, green for cleared. Everything else is neutral.

## 8. Functional requirements

### 8.1 Extracted fields

**Invoice:** supplier (name, address, country) · buyer/importer · invoice number · invoice date · currency (ISO 4217) · Incoterm (+ named place) · country of origin · line items (description, HSN, qty, unit, unit price, line amount) · invoice total · total gross weight (if printed).

**Packing list:** invoice reference · total packages and package type · line items (description, qty, packages, net wt, gross wt) · total net weight · total gross weight · container numbers · marks and numbers.

**Bill of lading:** B/L number · shipper · consignee · notify party · vessel/voyage · port of loading · port of discharge · container and seal numbers · total packages · total gross weight · cargo description.

Every field stores: value, normalised value, confidence 0–1, the AI's original value, source page, optional bounding box, and status (`ai`, `confirmed`, `edited`, `manual`).

### 8.2 Confidence (vision-model-only pipeline)

An LLM's own confidence number is poorly calibrated, so the model's score can only **lower** a field's confidence. Deterministic checks decide the rest.

```
score = model_reported (0..1)
if a format validator fails → score = min(score, 0.4)
if the value is null but the field is required → score = 0
flag field if score < 0.85                                        [A6]
```

Format validators: dates parse, and the date isn't in the future or more than 2 years old **[A7]** · HSN is 8 digits · ISO 6346 container check digit · ISO 4217 currency · Incoterm in the 2020 list · quantity and weights positive.

Cross-check results are a **separate flag type** from low confidence, so the reviewer can see why a field is flagged.

The 0.85 threshold is tuned on the synthetic eval set and reported in the TDD.

### 8.3 Cross-check rules

| ID | Rule | Documents | Tolerance |
|---|---|---|---|
| X1 | Invoice total = Σ line amounts | Invoice | ±0.01 in the currency **[A8]** |
| X2 | Line amount = qty × unit price | Invoice | ±0.01 |
| X3 | Total quantity matches for each item | Invoice ↔ PL | exact |
| X4 | Total packages match | PL ↔ B/L | exact |
| X5 | Total gross weight matches | PL ↔ B/L (↔ invoice if printed) | ±0.5% or 5 kg, whichever is smaller **[A9]** |
| X6 | Net weight ≤ gross weight | PL | n/a |
| X7 | Container numbers match as a set | PL ↔ B/L | exact after normalisation |
| X8 | Consignee/importer is the same party | Invoice ↔ PL ↔ B/L | fuzzy, similarity ≥ 0.85 **[A10]** |
| X9 | Invoice number referenced on the PL matches | Invoice ↔ PL | exact after normalisation |
| X10 | Σ line gross weights = total gross weight | PL | same as X5 |

- A rule with a missing input is **Not checkable**. That counts as a flag, never as a pass.
- Rules are pure functions with no AI involved, and each one has unit tests. They run again after every edit.

### 8.4 Resolution
- Low-confidence field → **Confirm** (keeps the value) or **Edit**.
- Failed cross-check → edit one of the values (the rules run again), or **Accept mismatch** with a required reason of at least 10 characters. Accepted mismatches go to the manager's overrides log.
- Every action writes an audit row: user, time, field, old value, new value, action, reason.

### 8.5 Export
- The server refuses export (HTTP 409 with the list of blockers) while any flag is open. The UI's disabled button is not the only guard.
- Assumed filing layout **[A3]**: one CSV with a header block and line rows. Columns are listed in the TDD.
- Each export is stored with a version number, a file hash and the user. Re-exporting after a reopen creates v2.

### 8.6 Edit history and accuracy (P1)
- Field history: a timeline of AI value → edits, with users.
- Accuracy for a field = share of fields where the AI value equals the final value. It's broken down by field name and by supplier, and only counts shipments that have been exported.

## 9. AI behaviour contract

1. The model only proposes values. A person confirms everything flagged, and nothing exports until every flag is cleared.
2. The original document is always shown and is the source of truth.
3. Unreadable pages and AI outages fall back to manual entry. They never block work.
4. Extraction output is checked against a strict schema. Output that doesn't parse is retried once, and then treated as a failure.
5. Prompts and the model version are stored on each extraction run, so results can be reproduced.
6. Client data must not be used to train the model (§10.2).

## 10. Non-functional requirements

### 10.1 Security
- No secrets in the repository: `.env.example` lists names only.
- Every input is validated on the server (schemas), and uploads are checked by content, not just by extension.
- Role and ownership checks on every API route, with tests.
- Files are kept in private storage and served through short-lived signed URLs.

### 10.2 Privacy and data residency (DPDP Act 2023; prices are confidential)
- Importer contact details (name, phone, email) are masked in lists and shown only on assigned shipments. Each reveal is logged.
- **Hosting in India:** AWS ap-south-1 (Mumbai) is the target. The deploy decision is deferred (D3).
- **AI provider: Gemini.** The production design is Gemini on **Vertex AI**, where Google states it does not train on customer data. The demo runs on a **free-tier key** using **synthetic data only** **[A11]**. The free tier may use content to improve Google's products, so it's acceptable only because no real client data is involved. The TDD says this plainly. The region and terms will be checked before the TDD is final.

### 10.3 Performance
- Extraction runs in a background job. The UI polls status. Target: under 60 s for a 3-document shipment **[A12]**.
- Free-tier rate limits: a queue with concurrency 1 and backoff. Seeded shipments come pre-extracted, so the demo doesn't depend on quota.

### 10.4 Reliability
Uploads are stored before extraction starts, so a retry needs no re-upload. Jobs are idempotent per document and version.

### 10.5 Devices
Desktop-first. On a phone: the list, overview, cross-checks and export screens are fully usable, and the review screen switches to tabs (Document / Fields).

### 10.6 Accessibility
Status is never shown by colour alone (icon + label). Every action works from the keyboard. Contrast meets WCAG AA.

## 11. Sample data and evaluation

- **Seed:** 12 shipments spread across every state. They include the brief's rows:
  - SHP-24811, Company B (China), LED panel light 40W, 2,400 units at USD 6.80. Invoice gross 3,120 kg vs PL 3,165 kg, so **X5 fails**.
  - SHP-24812, Company C (Sweden), steel ball valve DN50, 180 units at EUR 42.50, gross 1,460 kg.
- **Documents:** generated PDFs with clean and "scanned" variants (skew, noise, a stamp over text). At least one bilingual (Chinese + English) set. Planted errors cover every rule X1–X10. Every party is a fictional company **[A13]**, with no real personal data.
- **Eval set:** 20 synthetic shipments with ground-truth JSON. `make eval` reports accuracy per field and how many fields the threshold flags. The results go in the TDD.

## 12. Assumptions

| # | Assumption |
|---|---|
| A1 | Importers don't use the system in this phase. Staff upload on their behalf. |
| A2 | Executives see shipments assigned to them plus unassigned ones. Managers see everything. |
| A3 | The real import layout of the filing software is unknown. We define a documented CSV layout that can be swapped later. |
| A4 | Each upload is one document type. The AI suggests the type and the user can change it. |
| A5 | 15 MB per file and up to 10 pages per document. |
| A6 | Flag threshold 0.85, tuned on the eval set. |
| A7 | A valid document date is no more than 2 years old and not in the future. |
| A8 | Currency rounding tolerance is ±0.01. |
| A9 | Weight tolerance is ±0.5% or 5 kg, whichever is smaller. |
| A10 | The same party can be spelled differently across documents. Fuzzy similarity ≥ 0.85 counts as a match. |
| A11 | Demo uses a free-tier Gemini key with synthetic data only. Production uses Vertex AI in an Indian region. |
| A12 | 60 s per shipment is acceptable, since extraction runs in the background. |
| A13 | All companies and people in the seed data are fictional ("Company B" style names). |

## 13. Open decisions

| # | Decision | Proposal |
|---|---|---|
| D1 | What does manager "approval" mean if executives export? | Review of overrides after the fact, plus reopen. *Alternative:* an override needs manager sign-off before export. |
| D2 | Free-tier Gemini vs Vertex AI trial credits | Free tier for the demo (A11). Vertex in the design. |
| D3 | Deployment target | Deferred until the build is done. Must be an Indian region, or noted as a limitation. |

## 14. Acceptance checklist (demo script)

- [ ] Sign in as executive → list shows 12 shipments in mixed states.
- [ ] Upload the 3 PDFs for a new shipment → fields appear with confidence within about 60 s.
- [ ] SHP-24811 shows X5 failing with 3,120 vs 3,165 kg, and Export is blocked.
- [ ] Correct or accept with a reason → Export is enabled → CSV downloads.
- [ ] A call to the export API with open flags returns 409.
- [ ] A skewed or bilingual scan extracts. An unreadable page falls back to manual entry.
- [ ] Executive cannot open the manager report (403). Manager sees overrides and accuracy.
- [ ] Every screen has loading, empty and error states. The list works at 375 px width.
