-- 0002 — Sign-in (phone one-time codes + sessions), SMS to phone hashes, roles & permissions seed.
-- (transaction is managed by the migration runner)

-- One-time sign-in codes. Only an HMAC of the code is stored; the phone is stored because it is the login.
CREATE TABLE iam.otp_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164   text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  code_hmac    text NOT NULL,
  purpose      text NOT NULL DEFAULT 'sign_in' CHECK (purpose IN ('sign_in')),
  attempts     int  NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON iam.otp_challenges (phone_e164, created_at DESC);

-- A signed-in device. The refresh token is opaque; only its hash is stored and it rotates on every use.
CREATE TABLE iam.sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES iam.users(id),
  refresh_hash       text NOT NULL UNIQUE,
  previous_hash      text,                       -- last rotated-out token: reuse ⇒ the session is revoked
  user_agent         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  rotated_at         timestamptz,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  revoked_reason     text
);
CREATE INDEX ON iam.sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ON iam.sessions (previous_hash) WHERE previous_hash IS NOT NULL;

-- SMS can go to a phone that has no account yet (sign-in codes). Store only a hash of the number.
ALTER TABLE notify.outbound_messages ADD COLUMN to_phone_hash bytea;
ALTER TABLE notify.outbound_messages DROP CONSTRAINT outbound_messages_check;
ALTER TABLE notify.outbound_messages ADD CONSTRAINT outbound_messages_recipient_check
  CHECK (to_party_id IS NOT NULL OR to_user_id IS NOT NULL OR to_phone_hash IS NOT NULL);

-- Roles & permissions (API Outline §3). Codes are stable; descriptions are for the admin console.
INSERT INTO iam.permissions (code, description) VALUES
  ('vehicle.summary.read',        'See the public vehicle summary'),
  ('vehicle.report.full.read',    'See the full report, timeline and evidence ledger'),
  ('saved_check.manage',          'Save and remove vehicle checks'),
  ('vehicle.provisional.create',  'Add a vehicle SAZO could not find'),
  ('garage.job.create',           'Create and edit garage job drafts'),
  ('garage.job.submit',           'Submit garage jobs'),
  ('garage.staff.manage',         'Invite and remove garage staff'),
  ('submission.create',           'Submit records for the organisation''s own sources'),
  ('submission.read',             'Read the organisation''s own submissions'),
  ('organisation.approve',        'Approve, reject or suspend organisations'),
  ('conflict.review',             'Read and work the conflict review queue'),
  ('conflict.resolve',            'Resolve or dismiss conflicts'),
  ('identity.resolve',            'Decide ambiguous vehicle matches'),
  ('vehicle.merge',               'Merge and un-merge vehicles'),
  ('source.manage',               'Pause, retire or supersede data sources'),
  ('ruleset.activate',            'Activate rule-set versions and start rebuilds'),
  ('moderation.decide',           'Approve or reject community content');

INSERT INTO iam.roles (code, scope, name) VALUES
  ('consumer',         'platform',     'Consumer'),
  ('sazo_reviewer',    'platform',     'SAZO reviewer'),
  ('sazo_admin',       'platform',     'SAZO administrator'),
  ('org_manager',      'organisation', 'Organisation manager'),
  ('org_staff',        'organisation', 'Organisation staff'),
  ('partner_operator', 'organisation', 'Partner data-entry operator');

INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM iam.roles r JOIN iam.permissions p ON (
     (r.code = 'consumer'         AND p.code IN ('vehicle.summary.read','vehicle.report.full.read','saved_check.manage','vehicle.provisional.create'))
  OR (r.code = 'sazo_reviewer'    AND p.code IN ('vehicle.summary.read','vehicle.report.full.read','conflict.review','conflict.resolve','identity.resolve','moderation.decide'))
  OR (r.code = 'sazo_admin')
  OR (r.code = 'org_manager'      AND p.code IN ('garage.job.create','garage.job.submit','garage.staff.manage','submission.create','submission.read'))
  OR (r.code = 'org_staff'        AND p.code IN ('garage.job.create','garage.job.submit','submission.read'))
  OR (r.code = 'partner_operator' AND p.code IN ('submission.create','submission.read'))
);
