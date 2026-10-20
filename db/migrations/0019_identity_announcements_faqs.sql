-- 0019 SAZO admin use cases A-05 to A-07 (Accounts plan 1.5, 2.3 and 4.5; D-104, D-108, D-111).
--
-- A-05  Business managers (garages, inspection centres, dealers and data partners) send their National ID
--       number and a photo of their ID. A SAZO admin checks it: a business is approved only once every one of
--       its managers has sent theirs, and approving the business approves them; a manager added later is
--       checked on their own. The ID number is encrypted like other personal data and matched by keyed hash.
-- A-06  Announcements from SAZO staff to everyone or to one group, shown under the bell.
-- A-07  Help questions and answers (FAQs) for each group of users, drafted, published or hidden in the console,
--       with every change kept (who, when, before and after).

CREATE TABLE iam.identity_checks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES iam.users(id),
  nin_ciphertext        bytea NOT NULL,
  nin_key_version       int NOT NULL,
  nin_hash              bytea NOT NULL,       -- keyed hash: one ID number backs one person
  id_photo_evidence_id  uuid NOT NULL,        -- obs.evidence_files, kind official_document, uploaded by the person
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_reason       text,
  decided_by_user_id    uuid,
  decided_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'pending' OR (decision_reason IS NOT NULL AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX identity_checks_open ON iam.identity_checks (user_id) WHERE status IN ('pending','approved');
CREATE UNIQUE INDEX identity_checks_nin ON iam.identity_checks (nin_hash) WHERE status IN ('pending','approved');

INSERT INTO iam.permissions (code, description) VALUES
  ('identity.approve',    'Check business managers'' National IDs and approve or reject them'),
  ('announcement.manage', 'Send announcements to users and withdraw them'),
  ('faq.manage',          'Write, publish and hide help questions and answers')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM iam.roles r JOIN iam.permissions p ON r.code = 'sazo_admin' AND p.code IN ('identity.approve','announcement.manage','faq.manage')
ON CONFLICT DO NOTHING;

CREATE SCHEMA help;

-- Who an announcement or a help answer is for.
CREATE TABLE help.announcements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience            text NOT NULL CHECK (audience IN ('everyone','buyers','garages','dealers','inspectors','partners','brokers','staff')),
  title               text NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  body                text NOT NULL CHECK (length(body) BETWEEN 3 AND 2000),
  created_by_user_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  withdrawn_at        timestamptz,
  withdrawn_by_user_id uuid
);
CREATE INDEX announcements_live ON help.announcements (created_at DESC) WHERE withdrawn_at IS NULL;

CREATE TABLE help.announcement_reads (
  announcement_id  uuid NOT NULL REFERENCES help.announcements(id),
  user_id          uuid NOT NULL,
  read_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE help.faqs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience    text NOT NULL CHECK (audience IN ('everyone','buyers','garages','dealers','inspectors','partners','brokers','staff')),
  topic       text NOT NULL CHECK (length(topic) BETWEEN 2 AND 60),
  question    text NOT NULL CHECK (length(question) BETWEEN 5 AND 200),
  answer      text NOT NULL CHECK (length(answer) BETWEEN 5 AND 3000),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  position    int NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_touch BEFORE UPDATE ON help.faqs FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Every change to an FAQ: who, when, before and after (D-112). Never edited.
CREATE TABLE help.faq_changes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_id              uuid NOT NULL REFERENCES help.faqs(id),
  changed_by_user_id  uuid NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  before              jsonb,
  after               jsonb NOT NULL
);
SELECT platform.append_only('help.faq_changes');
