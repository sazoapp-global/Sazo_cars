-- Business logos and personal photos (D-186, 15 Nov 2026).
--
-- A business's logo is append only: each change is a new row and removing it is a row without a picture, so SAZO
-- keeps every logo a business used, who set it and when. The logo is the newest row.
-- A person's photo is personal data: one row per person, replaced or deleted outright (and with the account),
-- while the audit log records each change.

CREATE TABLE iam.organisation_logos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES iam.organisations(id),
  bytes            bytea,                                    -- NULL: the logo was removed
  mime             text CHECK (mime IN ('image/webp', 'image/jpeg', 'image/png')),
  set_by           uuid NOT NULL REFERENCES iam.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((bytes IS NULL) = (mime IS NULL)),
  CHECK (bytes IS NULL OR octet_length(bytes) <= 400000)
);
CREATE INDEX organisation_logos_newest ON iam.organisation_logos (organisation_id, created_at DESC);
SELECT platform.append_only('iam.organisation_logos');

CREATE TABLE iam.user_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),     -- a new id for each photo, so pages fetch the new one
  user_id     uuid NOT NULL UNIQUE REFERENCES iam.users(id),
  bytes       bytea NOT NULL CHECK (octet_length(bytes) <= 400000),
  mime        text NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg', 'image/png')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
