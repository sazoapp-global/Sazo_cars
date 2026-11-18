-- Notices for one person in the bell (D-191, 18 Nov 2026), next to SAZO's announcements. The first: a broker is
-- told when a customer they brought is late with a payment. Each is made once (the key), and links to where to look.
CREATE TABLE notify.personal_notices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES iam.users(id),
  key         text NOT NULL CHECK (length(key) BETWEEN 3 AND 200),
  title       text NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  body        text NOT NULL CHECK (length(body) BETWEEN 3 AND 600),
  href        text CHECK (href ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  UNIQUE (user_id, key)
);
CREATE INDEX personal_notices_newest ON notify.personal_notices (user_id, created_at DESC);
