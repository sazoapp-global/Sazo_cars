-- Dealer payments (D-122, D-146, 26 Oct 2026): how a buyer pays for a car the dealer sold, cash in full or a
-- deposit and monthly instalments. Records only: no money moves through SAZO. Payments are never changed or
-- deleted; a mistake is fixed with a correction that points at the payment it corrects. Each payment gets a
-- receipt number, and the buyer gets an SMS receipt. Reminders before and after a due date are sent once each.

CREATE TABLE dealer.payment_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,
  stock_item_id       uuid NOT NULL UNIQUE REFERENCES dealer.stock_items(id),
  lead_id             uuid REFERENCES dealer.leads(id),
  party_id            uuid NOT NULL,                        -- pii.parties: the buyer's name and phone, as given to this dealer
  kind                text NOT NULL CHECK (kind IN ('cash', 'instalments')),
  price_ugx           bigint NOT NULL CHECK (price_ugx > 0),
  deposit_ugx         bigint NOT NULL DEFAULT 0 CHECK (deposit_ugx >= 0),
  months              int CHECK (months BETWEEN 1 AND 120),
  reminders           boolean NOT NULL DEFAULT true,       -- the buyer agreed to texts before due dates and when late
  created_by_user_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'cash' OR months IS NOT NULL),
  CHECK (deposit_ugx < price_ugx OR kind = 'cash')
);
CREATE INDEX ON dealer.payment_plans (organisation_id, created_at DESC);

-- What is due and when. Number 0 is the deposit (or, for cash, the whole price on the day of sale).
CREATE TABLE dealer.plan_instalments (
  plan_id     uuid NOT NULL REFERENCES dealer.payment_plans(id),
  seq         int  NOT NULL CHECK (seq >= 0),
  due_on      date NOT NULL,
  amount_ugx  bigint NOT NULL CHECK (amount_ugx > 0),
  PRIMARY KEY (plan_id, seq)
);
SELECT platform.append_only('dealer.plan_instalments');

-- Payments received, in order. A correction has a negative amount and names the payment it corrects.
CREATE TABLE dealer.payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               uuid NOT NULL REFERENCES dealer.payment_plans(id),
  organisation_id       uuid NOT NULL,
  amount_ugx            bigint NOT NULL CHECK (amount_ugx <> 0),
  method                text NOT NULL CHECK (method IN ('cash', 'mtn_momo', 'airtel_money', 'bank', 'correction')),
  paid_on               date NOT NULL,
  reference             text,
  receipt_no            text NOT NULL,
  corrects_payment_id   uuid UNIQUE REFERENCES dealer.payments(id),
  note                  text,
  recorded_by_user_id   uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, receipt_no),
  CHECK ((method = 'correction') = (corrects_payment_id IS NOT NULL)),
  CHECK ((amount_ugx < 0) = (method = 'correction'))
);
CREATE INDEX ON dealer.payments (plan_id, paid_on, created_at);
CREATE INDEX ON dealer.payments (organisation_id, paid_on);
SELECT platform.append_only('dealer.payments');

-- Receipt numbers count up per dealer: R-0001, R-0002, …
CREATE TABLE dealer.receipt_counters (
  organisation_id  uuid PRIMARY KEY,
  last_no          int NOT NULL DEFAULT 0
);

-- Each reminder is sent at most once: before the due date, on it, when late (buyer), and when late (manager).
CREATE TABLE dealer.payment_reminders (
  plan_id   uuid NOT NULL REFERENCES dealer.payment_plans(id),
  seq       int  NOT NULL,
  kind      text NOT NULL CHECK (kind IN ('before', 'due', 'late', 'dealer_late')),
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, seq, kind)
);
