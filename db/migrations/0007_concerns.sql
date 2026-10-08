-- 0007 — Concerns raised by garages and inspectors (O-002, decided 8 Oct 2026): a business that sees signs of
-- fraud on a car (copied plate, tampered chassis or odometer, suspected stolen, fake papers) reports it.
-- SAZO staff review every report. While a serious report is open, the car shows a neutral "being checked"
-- notice; if staff uphold it, the notice says what was confirmed; if they dismiss it, the notice goes.

CREATE SCHEMA concern;

CREATE TABLE concern.reports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id           uuid,                               -- vehicle.vehicles (null until staff match the plate)
  plate_entered        text NOT NULL,
  organisation_id      uuid NOT NULL,                      -- iam.organisations: the reporting garage / inspector
  reporter_user_id     uuid NOT NULL,
  category             text NOT NULL CHECK (category IN ('cloned_plate','chassis_tampered','odometer_tampered','stolen_suspected','fake_documents','other')),
  severity             text NOT NULL CHECK (severity IN ('serious','attention')),
  description          text NOT NULL CHECK (length(description) BETWEEN 10 AND 2000),
  evidence_ids         uuid[] NOT NULL DEFAULT '{}',       -- obs.evidence_files
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','dismissed')),
  reviewer_user_id     uuid,
  decision_reason      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  decided_at           timestamptz,
  CHECK (status = 'open' OR (decided_at IS NOT NULL AND reviewer_user_id IS NOT NULL AND decision_reason IS NOT NULL))
);
CREATE INDEX ON concern.reports (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX ON concern.reports (status, created_at);
CREATE INDEX ON concern.reports (organisation_id, created_at DESC);

INSERT INTO iam.permissions (code, description) VALUES
  ('concern.report', 'Report signs of fraud on a car'),
  ('concern.review', 'Review concerns reported by businesses')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM iam.roles r JOIN iam.permissions p ON (
     (r.code IN ('org_manager', 'org_staff') AND p.code = 'concern.report')
  OR (r.code IN ('sazo_reviewer', 'sazo_admin') AND p.code = 'concern.review')
)
ON CONFLICT DO NOTHING;
