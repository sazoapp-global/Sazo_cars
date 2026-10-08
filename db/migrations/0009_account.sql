-- 0009 — Account settings: change name or phone, texts, devices, download my data, delete my account
-- (Uganda Data Protection and Privacy Act 2019: access, correction, objection, erasure).

-- A deleted account keeps its id (records it entered stay attributable) but no phone, email or name.
ALTER TABLE iam.users DROP CONSTRAINT users_check;
ALTER TABLE iam.users ADD CONSTRAINT users_check CHECK (status = 'deleted' OR phone_e164 IS NOT NULL OR email IS NOT NULL);
ALTER TABLE iam.users ADD COLUMN deleted_at timestamptz;

-- Changing the phone number needs a code sent to the NEW number; sign-in codes can't be used for it.
ALTER TABLE iam.otp_challenges DROP CONSTRAINT otp_challenges_purpose_check;
ALTER TABLE iam.otp_challenges ADD CONSTRAINT otp_challenges_purpose_check CHECK (purpose IN ('sign_in', 'change_phone'));
ALTER TABLE iam.otp_challenges ADD COLUMN user_id uuid REFERENCES iam.users(id);

-- "Don't text me to confirm garage visits": wins over any consent a garage records later.
ALTER TABLE pii.parties ADD COLUMN sms_opt_out_at timestamptz;
