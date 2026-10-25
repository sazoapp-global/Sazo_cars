-- Password reset with phone, and a second step for everyone (D-145, 25 Oct 2026).
--  • A reset needs the emailed link AND a code texted to the account's phone.
--  • Every account gets a second step on a new device: SMS code, or an email code while it has no phone.
--  • SAZO staff (reviewers, admins, super admins) use an authenticator app instead of SMS, with backup codes.

-- Reset codes go to the account's phone, tied to the account.
ALTER TABLE iam.otp_challenges DROP CONSTRAINT otp_challenges_purpose_check;
ALTER TABLE iam.otp_challenges ADD CONSTRAINT otp_challenges_purpose_check
  CHECK (purpose IN ('sign_in', 'change_phone', 'reset_password', 'add_phone'));

-- Second step by authenticator app, by backup code, or by the account's password (after a phone code).
ALTER TABLE iam.second_step_challenges DROP CONSTRAINT second_step_challenges_channel_check;
ALTER TABLE iam.second_step_challenges ADD CONSTRAINT second_step_challenges_channel_check
  CHECK (channel IN ('sms', 'email', 'authenticator', 'password'));
ALTER TABLE iam.second_step_challenges ALTER COLUMN code_hmac DROP NOT NULL;

-- One authenticator app per person. The key is personal data and stored encrypted (platform/keyring.ts).
-- `confirmed_at` is set once the person typed a correct code from the app; until then it is a set-up in progress.
-- `last_step` = the last 30-second window used, so the same code can't be used twice.
CREATE TABLE iam.authenticators (
  user_id            uuid PRIMARY KEY REFERENCES iam.users(id),
  secret_ciphertext  bytea NOT NULL,
  key_version        int   NOT NULL,
  confirmed_at       timestamptz,
  last_step          bigint,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Ten one-time backup codes for when the phone with the app is lost. Only a hash is kept.
CREATE TABLE iam.backup_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES iam.users(id),
  code_hmac   text NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON iam.backup_codes (user_id) WHERE used_at IS NULL;

-- SAZO administrators can clear a staff member's app (a lost phone with no backup codes left).
INSERT INTO iam.permissions (code, description) VALUES ('authenticator.reset', 'Clear a person''s authenticator app so they set up a new one')
  ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, 'authenticator.reset' FROM iam.roles r WHERE r.code = 'sazo_admin'
  ON CONFLICT DO NOTHING;
