-- 0001: initial schema. See docs/TDD.md section 3.

CREATE TYPE user_role AS ENUM ('executive', 'manager');
CREATE TYPE shipment_status AS ENUM ('draft', 'extracting', 'needs_review', 'cleared', 'exported');
CREATE TYPE doc_type AS ENUM ('invoice', 'packing_list', 'bill_of_lading');
CREATE TYPE extraction_status AS ENUM ('pending', 'running', 'done', 'failed', 'manual');
CREATE TYPE field_status AS ENUM ('ai', 'confirmed', 'edited', 'manual');
CREATE TYPE check_status AS ENUM ('pass', 'fail', 'not_checkable');
CREATE TYPE job_status AS ENUM ('queued', 'running', 'done', 'failed');

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    name          TEXT NOT NULL,
    role          user_role NOT NULL,
    password_hash TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id           BIGSERIAL PRIMARY KEY,
    token_hash   TEXT NOT NULL UNIQUE,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Importer contacts are personal data (DPDP Act 2023): masked by the API unless the caller may see them.
CREATE TABLE importers (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    iec_code      TEXT NOT NULL UNIQUE,
    contact_name  TEXT,
    contact_phone TEXT,
    contact_email TEXT
);

CREATE TABLE suppliers (
    id      BIGSERIAL PRIMARY KEY,
    name    TEXT NOT NULL,
    country TEXT NOT NULL,
    UNIQUE (name, country)
);

CREATE TABLE shipments (
    id          BIGSERIAL PRIMARY KEY,
    ref         TEXT NOT NULL UNIQUE CHECK (ref ~ '^SHP-[0-9]{5}$'),
    importer_id BIGINT NOT NULL REFERENCES importers(id),
    supplier_id BIGINT REFERENCES suppliers(id),
    assignee_id BIGINT REFERENCES users(id),
    -- Cached output of recompute_status(); never written directly by handlers.
    status      shipment_status NOT NULL DEFAULT 'draft',
    created_by  BIGINT NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shipments_status_idx ON shipments(status);
CREATE INDEX shipments_assignee_idx ON shipments(assignee_id);
CREATE SEQUENCE shipment_ref_seq START 24900;

CREATE TABLE documents (
    id                BIGSERIAL PRIMARY KEY,
    shipment_id       BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    doc_type          doc_type NOT NULL,
    file_key          TEXT NOT NULL,
    file_name         TEXT NOT NULL,
    mime              TEXT NOT NULL,
    size_bytes        INTEGER NOT NULL CHECK (size_bytes > 0),
    sha256            TEXT NOT NULL,
    page_count        INTEGER,
    extraction_status extraction_status NOT NULL DEFAULT 'pending',
    detected_type     doc_type,
    error             TEXT,
    superseded_at     TIMESTAMPTZ,
    uploaded_by       BIGINT NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One active document per type per shipment.
CREATE UNIQUE INDEX documents_active_type_uq
    ON documents(shipment_id, doc_type) WHERE superseded_at IS NULL;

CREATE TABLE extraction_runs (
    id             BIGSERIAL PRIMARY KEY,
    document_id    BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    model          TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    attempt        INTEGER NOT NULL,
    status         TEXT NOT NULL,
    raw_response   JSONB,
    latency_ms     INTEGER,
    tokens_in      INTEGER,
    tokens_out     INTEGER,
    error          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fields (
    id               BIGSERIAL PRIMARY KEY,
    document_id      BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    key              TEXT NOT NULL,
    line_index       INTEGER,
    value            TEXT,
    normalized       JSONB,
    ai_value         TEXT,
    model_confidence REAL CHECK (model_confidence BETWEEN 0 AND 1),
    confidence       REAL NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
    validator_errors TEXT[] NOT NULL DEFAULT '{}',
    status           field_status NOT NULL DEFAULT 'ai',
    page             INTEGER,
    bbox             JSONB,
    version          INTEGER NOT NULL DEFAULT 1,
    updated_by       BIGINT REFERENCES users(id),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fields_doc_key_line_uq
    ON fields(document_id, key, COALESCE(line_index, -1));

CREATE TABLE check_results (
    id            BIGSERIAL PRIMARY KEY,
    shipment_id   BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    rule_id       TEXT NOT NULL,
    status        check_status NOT NULL,
    inputs        JSONB NOT NULL,
    inputs_hash   TEXT NOT NULL,
    message       TEXT NOT NULL,
    accepted_by   BIGINT REFERENCES users(id),
    accept_reason TEXT CHECK (accept_reason IS NULL OR length(accept_reason) >= 10),
    -- An acceptance only counts while the inputs it was given still hash the same.
    accepted_hash TEXT,
    accepted_at   TIMESTAMPTZ,
    computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (shipment_id, rule_id)
);

CREATE TABLE exports (
    id          BIGSERIAL PRIMARY KEY,
    shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    format      TEXT NOT NULL,
    file_key    TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    row_count   INTEGER NOT NULL,
    created_by  BIGINT NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (shipment_id, version)
);

-- Append-only. In production the app role is granted INSERT/SELECT only (TDD A17).
CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    actor_id   BIGINT REFERENCES users(id),
    entity     TEXT NOT NULL,
    entity_id  BIGINT,
    action     TEXT NOT NULL,
    before     JSONB,
    after      JSONB,
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log(entity, entity_id);

CREATE TABLE jobs (
    id         BIGSERIAL PRIMARY KEY,
    kind       TEXT NOT NULL,
    payload    JSONB NOT NULL,
    status     job_status NOT NULL DEFAULT 'queued',
    attempts   INTEGER NOT NULL DEFAULT 0,
    run_after  TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at  TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs(run_after) WHERE status = 'queued';

-- Login throttling (5 attempts / minute per IP+email), kept in Postgres so it survives restarts.
CREATE TABLE login_attempts (
    id         BIGSERIAL PRIMARY KEY,
    key        TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_key_idx ON login_attempts(key, created_at);
