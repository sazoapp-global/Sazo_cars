-- 0018 A dealer manager adds many cars at once from an Excel or CSV file (D-131). The file is read, every row
-- is checked and shown to the manager first; nothing is added until they confirm. The checked rows (including
-- import costs, which only managers see) are kept with what happened to each row, and the same file cannot be
-- added twice.
CREATE TABLE dealer.stock_imports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,                -- iam.organisations
  created_by_user_id  uuid NOT NULL,                -- iam.users
  file_name           text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  file_sha256         bytea NOT NULL CHECK (length(file_sha256) = 32),
  rows                jsonb NOT NULL,               -- [{ line, row, problems }]
  results             jsonb,                        -- [{ line, stockId? , error? }] once added
  status              text NOT NULL DEFAULT 'checked' CHECK (status IN ('checked', 'adding', 'added')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  added_at            timestamptz
);
CREATE INDEX stock_imports_org ON dealer.stock_imports (organisation_id, created_at DESC);
-- One file is added once per dealer.
CREATE UNIQUE INDEX stock_imports_file_once ON dealer.stock_imports (organisation_id, file_sha256) WHERE status <> 'checked';
