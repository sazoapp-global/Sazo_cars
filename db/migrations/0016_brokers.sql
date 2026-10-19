-- 0016 Dealership system, step 3: brokers (D-121, D-126 to D-129). Brokers are an open marketplace: once
-- SAZO has checked their identity (National ID number and photo, D-127), they can share any car a dealer has
-- opened to brokers, register customers through their own links, and see their own enquiries and commissions.
-- A customer stays the broker's for the dealer's protection period (D-128); when two people claim the same
-- customer, the dealer decides and the reason is kept. Commissions are records only (D-122).

-- Identity check for brokers (iam owns identity).
CREATE TABLE iam.broker_applications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES iam.users(id),
  nin_ciphertext        bytea NOT NULL,       -- National ID number, encrypted like other personal data
  nin_key_version       int NOT NULL,
  nin_hash              bytea NOT NULL,       -- keyed hash, so one ID number cannot back two broker accounts
  id_photo_evidence_id  uuid NOT NULL,        -- obs.evidence_files, kind official_document, uploaded by the applicant
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_reason       text,
  decided_by_user_id    uuid,
  decided_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'pending' OR (decision_reason IS NOT NULL AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX broker_applications_open ON iam.broker_applications (user_id) WHERE status IN ('pending','approved');
CREATE UNIQUE INDEX broker_applications_nin ON iam.broker_applications (nin_hash) WHERE status IN ('pending','approved');

INSERT INTO iam.roles (code, scope, name) VALUES ('broker', 'platform', 'Car broker') ON CONFLICT DO NOTHING;
INSERT INTO iam.permissions (code, description) VALUES
  ('broker.access',  'Use the broker marketplace: share cars open to brokers and see own enquiries and commissions'),
  ('broker.approve', 'Check broker identity documents and approve or reject brokers')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM iam.roles r JOIN iam.permissions p ON (
     (r.code = 'broker'     AND p.code IN ('broker.access','vehicle.summary.read','vehicle.report.full.read'))
  OR (r.code = 'sazo_admin' AND p.code IN ('broker.approve'))
) ON CONFLICT DO NOTHING;

-- Who brought the customer, and for how long they keep them.
ALTER TABLE dealer.leads
  ADD COLUMN protected_until        timestamptz,                       -- set when a broker registers the customer
  ADD COLUMN earlier_lead_id        uuid REFERENCES dealer.leads(id),  -- an earlier registration of the same phone at this dealer
  ADD COLUMN needs_decision         boolean NOT NULL DEFAULT false,    -- two claims on one customer: the dealer decides
  ADD COLUMN split_broker_user_id   uuid,                              -- a second broker sharing the commission
  ADD COLUMN split_percent          integer CHECK (split_percent BETWEEN 1 AND 99);  -- this lead's broker share when split

CREATE TABLE dealer.lead_decisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  lead_id             uuid NOT NULL REFERENCES dealer.leads(id),
  outcome             text NOT NULL CHECK (outcome IN ('keep','earlier','split','dealer')),
  broker_user_id      uuid,          -- who gets the credit after the decision
  split_broker_user_id uuid,
  split_percent       integer,
  reason              text NOT NULL,
  decided_by_user_id  uuid NOT NULL,
  decided_at          timestamptz NOT NULL DEFAULT now()
);
SELECT platform.append_only('dealer.lead_decisions');

-- Commission records (no money moves through SAZO). Worked out when a sale completes, from the car's terms then.
CREATE TABLE dealer.commissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  lead_id             uuid NOT NULL REFERENCES dealer.leads(id),
  stock_item_id       uuid NOT NULL REFERENCES dealer.stock_items(id),
  broker_user_id      uuid NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('fixed','percent')),
  percent             numeric(5,2),
  sale_price_ugx      bigint NOT NULL,
  share_percent       integer NOT NULL DEFAULT 100 CHECK (share_percent BETWEEN 1 AND 100),
  amount_ugx          bigint NOT NULL CHECK (amount_ugx >= 0),
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('on_hold','pending','approved','paid','cancelled')),
  paid_reference      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, broker_user_id)
);
CREATE INDEX ON dealer.commissions (organisation_id, status);
CREATE INDEX ON dealer.commissions (broker_user_id, status);
CREATE TRIGGER trg_touch BEFORE UPDATE ON dealer.commissions FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Every change to a commission, with who and why (append-only; a reversal is a cancellation with a reason).
CREATE TABLE dealer.commission_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL,
  commission_id    uuid NOT NULL REFERENCES dealer.commissions(id),
  from_status      text,
  to_status        text NOT NULL,
  amount_ugx       bigint,
  note             text,
  actor_user_id    uuid,
  at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON dealer.commission_events (commission_id, at);
SELECT platform.append_only('dealer.commission_events');
