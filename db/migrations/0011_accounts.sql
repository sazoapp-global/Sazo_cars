-- 0011 — Accounts (D-100 – D-105): create an account before logging in; email + password, phone + code or
-- Google; surname / first / middle name, gender and date of birth (18+) at sign-up; confirmed email;
-- forgot password; every log-in attempt recorded; a second step on new devices for sensitive roles.

-- Names and identity details. Date of birth is personal data used to identify people and check eligibility:
-- it is stored encrypted with the same keyring as other personal data (platform/keyring.ts).
ALTER TABLE iam.users
  ADD COLUMN surname            text,
  ADD COLUMN first_name         text,
  ADD COLUMN middle_name        text,
  ADD COLUMN gender             text CHECK (gender IN ('male', 'female')),
  ADD COLUMN dob_ciphertext     bytea,
  ADD COLUMN dob_key_version    int,
  ADD COLUMN email_verified_at  timestamptz,
  ADD CONSTRAINT users_dob_check CHECK ((dob_ciphertext IS NULL) = (dob_key_version IS NULL)),
  ADD CONSTRAINT users_email_verified_check CHECK (email_verified_at IS NULL OR email IS NOT NULL);

-- Existing accounts only had one "display name": best-effort split ("Sarah Namukasa" → first Sarah, surname
-- Namukasa). Single names have no surname yet; the person is asked to finish their details at next log-in.
UPDATE iam.users
   SET first_name = split_part(btrim(display_name), ' ', 1),
       surname = NULLIF(btrim(substr(btrim(display_name), length(split_part(btrim(display_name), ' ', 1)) + 1)), '')
 WHERE status <> 'deleted' AND display_name <> '';

-- Passwords live in iam.auth_identities (provider 'password', subject = user id, scrypt hash).
-- `strong` = the password met the stricter rule for sensitive roles (12+ characters) when it was set.
ALTER TABLE iam.auth_identities ADD COLUMN strong boolean NOT NULL DEFAULT false;
ALTER TABLE iam.auth_identities ADD COLUMN email text;          -- Google: the email Google gave at linking
ALTER TABLE iam.auth_identities ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX auth_identities_one_password ON iam.auth_identities (user_id) WHERE provider = 'password';

-- Email links: confirm an email address, or reset a forgotten password. Only a hash of the token is kept.
CREATE TABLE iam.email_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES iam.users(id),
  purpose     text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  email       text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON iam.email_tokens (user_id, purpose, created_at DESC);
CREATE INDEX ON iam.email_tokens (lower(email), created_at DESC);

-- Every log-in attempt, successful or not (D-111): lockouts, the console's sign-in counts and attack alerts.
-- `identifier_hash` is an HMAC of the email or phone typed, so attempts on unknown accounts are counted too.
CREATE TABLE iam.login_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid,
  identifier_hash  bytea,
  method           text NOT NULL CHECK (method IN ('password', 'phone_code', 'google', 'second_step')),
  success          boolean NOT NULL,
  failure_reason   text,
  ip               inet,
  user_agent       text,
  at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON iam.login_attempts (user_id, at DESC);
CREATE INDEX ON iam.login_attempts (identifier_hash, at DESC);
CREATE INDEX ON iam.login_attempts (ip, at DESC);
SELECT platform.append_only('iam.login_attempts');

-- Second step for sensitive roles on a device not seen before (D-105): a code by SMS or email.
CREATE TABLE iam.second_step_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES iam.users(id),
  channel      text NOT NULL CHECK (channel IN ('sms', 'email')),
  method       text NOT NULL CHECK (method IN ('password', 'phone_code', 'google')),
  code_hmac    text NOT NULL,
  attempts     int  NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON iam.second_step_challenges (user_id, created_at DESC);

-- Devices that passed the second step ("remember this device"). Only a hash of the device token is kept.
CREATE TABLE iam.trusted_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES iam.users(id),
  token_hash    text NOT NULL UNIQUE,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX ON iam.trusted_devices (user_id) WHERE revoked_at IS NULL;

-- Email messages are logged like SMS (address never stored: only an HMAC).
ALTER TABLE notify.outbound_messages ADD COLUMN to_email_hash bytea;
ALTER TABLE notify.outbound_messages DROP CONSTRAINT outbound_messages_recipient_check;
ALTER TABLE notify.outbound_messages ADD CONSTRAINT outbound_messages_recipient_check
  CHECK (to_party_id IS NOT NULL OR to_user_id IS NOT NULL OR to_phone_hash IS NOT NULL OR to_email_hash IS NOT NULL);
