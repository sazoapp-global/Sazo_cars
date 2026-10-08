-- 0004 — "My cars": owners prove a car is theirs (O-007, decided 8 Oct 2026):
--   1. their signed-in phone matches the phone on the registry's owner record → confirmed at once, or
--   2. they send a logbook photo → a SAZO reviewer approves or rejects it.

CREATE TABLE report.ownership_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,                    -- iam.users
  vehicle_id         uuid NOT NULL,                    -- vehicle.vehicles
  method             text NOT NULL CHECK (method IN ('phone_match','logbook')),
  status             text NOT NULL CHECK (status IN ('pending','verified','rejected','ended','withdrawn')),
  evidence_ids       uuid[] NOT NULL DEFAULT '{}',     -- obs.evidence_files (logbook photo)
  reviewer_user_id   uuid,
  decision_reason    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz,
  ended_at           timestamptz,
  CHECK (method <> 'logbook' OR cardinality(evidence_ids) > 0),
  CHECK (status NOT IN ('verified','rejected') OR decided_at IS NOT NULL)
);
-- One live claim per person and car.
CREATE UNIQUE INDEX ownership_claims_live ON report.ownership_claims (user_id, vehicle_id) WHERE status IN ('pending','verified');
CREATE INDEX ON report.ownership_claims (status, created_at) WHERE status = 'pending';

INSERT INTO iam.permissions (code, description) VALUES
  ('ownership.claim',  'Claim a car as its owner and manage "my cars"'),
  ('ownership.review', 'Approve or reject ownership claims made with a logbook photo')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM iam.roles r JOIN iam.permissions p ON (
     (r.code = 'consumer'      AND p.code = 'ownership.claim')
  OR (r.code = 'sazo_reviewer' AND p.code = 'ownership.review')
  OR (r.code = 'sazo_admin'    AND p.code IN ('ownership.claim', 'ownership.review'))
)
ON CONFLICT DO NOTHING;
