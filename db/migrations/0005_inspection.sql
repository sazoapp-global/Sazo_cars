-- 0005 — Inspector workspace (P-004, P-005): inspectors and inspection centres record structured
-- inspections from the phone app. Same shape as garage jobs: a draft made on the phone (offline-safe id),
-- saved step by step, then sent once through Ingestion on the organisation's own source (inspector_app).

CREATE SCHEMA inspection;

CREATE SEQUENCE inspection.ref_seq;

CREATE TABLE inspection.inspections (
  id                      uuid PRIMARY KEY,                -- generated on the phone (offline), UUIDv7
  public_ref              text NOT NULL UNIQUE,            -- IN-YYMM-00001
  organisation_id         uuid NOT NULL,                   -- iam.organisations (inspector / inspection_centre)
  created_by_user_id      uuid NOT NULL,
  plate_entered           text NOT NULL,
  vehicle_id              uuid,                            -- vehicle.vehicles, once resolved
  form                    jsonb NOT NULL,                  -- the checklist answers (@sazo/contracts InspectionForm)
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','accepted','rejected')),
  client_created_at       timestamptz NOT NULL,            -- device time = when the inspection happened
  submitted_at            timestamptz,
  submission_id           uuid,                            -- ingest.submissions
  report_evidence_id      uuid,                            -- obs.evidence_files: the signed checklist SAZO stores
  rejection_reason        text,
  version                 int NOT NULL DEFAULT 1,
  acknowledged_warnings   jsonb NOT NULL DEFAULT '[]',
  submit_idempotency_key  uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'draft' OR submitted_at IS NOT NULL)
);
CREATE INDEX ON inspection.inspections (organisation_id, created_at DESC);
CREATE TRIGGER trg_touch BEFORE UPDATE ON inspection.inspections FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- The inspection report SAZO writes at submission (the checklist, who did it, photo fingerprints) is a JSON file.
-- People still upload only photos and PDFs (checked by the API).
ALTER TABLE obs.evidence_uploads DROP CONSTRAINT evidence_uploads_mime_type_check;
ALTER TABLE obs.evidence_uploads ADD CONSTRAINT evidence_uploads_mime_type_check
  CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf','application/json'));

INSERT INTO iam.permissions (code, description) VALUES
  ('inspection.create', 'Create and edit inspection drafts'),
  ('inspection.submit', 'Submit inspections')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM iam.roles r JOIN iam.permissions p ON p.code IN ('inspection.create', 'inspection.submit')
 WHERE r.code IN ('org_manager', 'org_staff')
ON CONFLICT DO NOTHING;
