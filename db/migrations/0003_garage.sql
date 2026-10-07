-- 0003 — Garage workspace (module 7): evidence uploads, owner-confirmation links, job versions.

-- Evidence uploads: a slot is reserved first (kind, size, hash declared by the phone), the bytes are
-- stored write-once, then "complete" re-hashes them and only then creates obs.evidence_files.
CREATE TABLE obs.evidence_uploads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 text NOT NULL CHECK (kind IN ('odometer_photo','engine_number_photo','plate_photo','vehicle_photo','receipt',
                         'invoice','part_photo','inspection_report','official_document','org_verification_document','other')),
  mime_type            text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes           bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 15000000),
  sha256               text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  captured_at          timestamptz,
  storage_key          text NOT NULL UNIQUE,
  uploaded_by_user_id  uuid NOT NULL,
  expires_at           timestamptz NOT NULL,
  content_received_at  timestamptz,
  evidence_file_id     uuid REFERENCES obs.evidence_files(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON obs.evidence_uploads (uploaded_by_user_id, created_at DESC);

-- Owner-confirmation links (D-058): only a hash of the single-use token is stored.
ALTER TABLE obs.attestation_requests ADD COLUMN token_hash bytea UNIQUE;
-- A party can answer one request once.
CREATE UNIQUE INDEX attestations_one_answer_per_request ON obs.attestations (request_id) WHERE request_id IS NOT NULL;

-- Jobs: optimistic concurrency, the warnings a user chose to continue past (D-059), replay-safe submit.
ALTER TABLE garage.jobs
  ADD COLUMN version                int NOT NULL DEFAULT 1,
  ADD COLUMN acknowledged_warnings  jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN submit_idempotency_key uuid;

ALTER TABLE garage.job_customers
  ADD COLUMN attestation_request_id uuid;   -- obs.attestation_requests

CREATE SEQUENCE garage.job_ref_seq;
