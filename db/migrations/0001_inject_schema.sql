-- Inject module tables. Legacy SIPPP tables in `public` are never altered.
CREATE SCHEMA IF NOT EXISTS inject;

CREATE TABLE IF NOT EXISTS inject.schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- One uploaded spreadsheet = one batch, always for a single pemda + tahun.
CREATE TABLE IF NOT EXISTS inject.batch (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun         int  NOT NULL,
  pemda_kode    varchar(5),
  pemda_nama    varchar(100),
  file_name     text NOT NULL,
  file_sha256   char(64) NOT NULL,
  status        text NOT NULL DEFAULT 'parsed'
                CHECK (status IN ('parsed','reviewing','applying','applied','failed')),
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings      jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by   varchar(50) NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  applied_by    varchar(50),
  applied_at    timestamptz,
  notes         text
);
CREATE INDEX IF NOT EXISTS batch_pemda_idx ON inject.batch (tahun, pemda_kode, uploaded_at DESC);

-- Every data row of every sheet, with each pipeline stage persisted so the review UI
-- can show raw -> normalised -> resolved -> planned side by side.
CREATE TABLE IF NOT EXISTS inject.row (
  id            bigserial PRIMARY KEY,
  batch_id      uuid NOT NULL REFERENCES inject.batch(id) ON DELETE CASCADE,
  sheet         text NOT NULL,
  sheet_kind    text NOT NULL,
  row_no        int  NOT NULL,
  raw           jsonb NOT NULL,
  normalized    jsonb NOT NULL,
  resolved      jsonb NOT NULL,
  action        text NOT NULL CHECK (action IN ('update','insert','insert_with_rkpd','error')),
  issues        jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan          jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_review  boolean NOT NULL DEFAULT false,
  decision      text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected')),
  decided_by    varchar(50),
  decided_at    timestamptz,
  overrides     jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at    timestamptz,
  result        jsonb
);
CREATE INDEX IF NOT EXISTS row_batch_idx ON inject.row (batch_id, action, decision);

-- Human-confirmed mappings ("knowledge"): once an operator confirms that
-- "DINAS PERUMAHAN DAN KAWASAN PEMUKIMAN" means unit 1.04.0.00.0.00.01.0000 for pemda 94.08,
-- the next batch resolves it deterministically instead of fuzzily.
CREATE TABLE IF NOT EXISTS inject.alias (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('pemda','skpd','satuan','misi','pp','spp','dana','kelompok')),
  scope       varchar(5) NOT NULL DEFAULT '',   -- pemda_kode for skpd, '' for global
  alias_norm  text NOT NULL,
  target_key  text NOT NULL,
  target_label text,
  created_by  varchar(50) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, scope, alias_norm)
);

-- Before/after of every legacy row the apply step touches.
CREATE TABLE IF NOT EXISTS inject.audit_log (
  id          bigserial PRIMARY KEY,
  batch_id    uuid NOT NULL REFERENCES inject.batch(id) ON DELETE CASCADE,
  row_id      bigint REFERENCES inject.row(id) ON DELETE SET NULL,
  table_name  text NOT NULL,
  pk          text NOT NULL,
  op          text NOT NULL CHECK (op IN ('insert','update','delete')),
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now(),
  by          varchar(50) NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_batch_idx ON inject.audit_log (batch_id);
