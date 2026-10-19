-- 0014 Dealership system, step 1: cars (D-120, D-124, D-125; plan "SAZO Dealership System Plan").
-- A car can be added before its chassis number is known (step 1 of "add a car"); it joins SAZO history only
-- once it is linked to a vehicle. Each car keeps its import stage, its two clocks (days in stock and the
-- customs bond deadline), its photos, and an append-only cost ledger in the original currency.

ALTER TABLE dealer.stock_items ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE dealer.stock_items
  ADD COLUMN make                    text,
  ADD COLUMN model                   text,
  ADD COLUMN model_year              integer CHECK (model_year BETWEEN 1950 AND 2100),
  ADD COLUMN engine_cc               integer CHECK (engine_cc > 0 AND engine_cc < 20000),
  ADD COLUMN fuel                    text CHECK (fuel IN ('petrol','diesel','hybrid','electric','lpg','other')),
  ADD COLUMN transmission            text CHECK (transmission IN ('manual','automatic','cvt','other')),
  ADD COLUMN colour                  text,
  ADD COLUMN yard                    text,
  ADD COLUMN stage                   text NOT NULL DEFAULT 'at_yard'
                                     CHECK (stage IN ('bought','shipping','at_port','in_bond','cleared','at_yard')),
  ADD COLUMN received_on             date,          -- when the dealer took the car on; days in stock count from here
  ADD COLUMN bond_arrived_on         date,          -- arrival at the customs bonded warehouse
  ADD COLUMN customs_status          text CHECK (customs_status IN ('not_entered','in_bond','assessed','duty_paid','released')),
  ADD COLUMN customs_deadline        date,          -- the deadline that applies to this car, as the dealer was told (D-124)
  ADD COLUMN customs_extension_until date,          -- an approved extension, if any
  ADD COLUMN customs_value_ugx       bigint CHECK (customs_value_ugx > 0),  -- URA's value, kept apart from costs
  ADD COLUMN tiktok_url              text,
  ADD COLUMN open_to_brokers         boolean NOT NULL DEFAULT true,          -- D-126
  ADD COLUMN commission_kind         text CHECK (commission_kind IN ('fixed','percent')),  -- D-129
  ADD COLUMN commission_fixed_ugx    bigint CHECK (commission_fixed_ugx > 0),
  ADD COLUMN commission_percent      numeric(5,2) CHECK (commission_percent > 0 AND commission_percent <= 20),
  ADD CONSTRAINT stock_commission_shape CHECK (
    commission_kind IS NULL
    OR (commission_kind = 'fixed' AND commission_fixed_ugx IS NOT NULL AND commission_percent IS NULL)
    OR (commission_kind = 'percent' AND commission_percent IS NOT NULL AND commission_fixed_ugx IS NULL)),
  ADD CONSTRAINT stock_has_something CHECK (vehicle_id IS NOT NULL OR make IS NOT NULL);

-- Costs: every entry is kept for good; a correction is a reversal entry pointing at the one it cancels.
CREATE TABLE dealer.cost_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id      uuid NOT NULL,
  stock_item_id        uuid NOT NULL REFERENCES dealer.stock_items(id),
  category             text NOT NULL CHECK (category IN ('purchase','freight_insurance','port_shipping','customs_taxes','clearing_agent',
                                                         'transport','inspection_repairs','registration_plates','other')),
  amount               numeric(18,2) NOT NULL CHECK (amount > 0),
  currency             char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rate_to_ugx          numeric(18,6) NOT NULL CHECK (rate_to_ugx > 0),
  amount_ugx           bigint NOT NULL CHECK (amount_ugx > 0),
  note                 text,
  share_rule           text,          -- how a shared shipment cost was split, e.g. "Split equally across 4 cars"
  reverses_entry_id    uuid UNIQUE REFERENCES dealer.cost_entries(id),
  created_by_user_id   uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (currency <> 'UGX' OR rate_to_ugx = 1)
);
CREATE INDEX ON dealer.cost_entries (stock_item_id, created_at);
SELECT platform.append_only('dealer.cost_entries');

CREATE TABLE dealer.stock_photos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    uuid NOT NULL,
  stock_item_id      uuid NOT NULL REFERENCES dealer.stock_items(id),
  evidence_id        uuid NOT NULL,     -- obs.evidence_files, kind vehicle_photo, uploaded by a member of this dealer
  position           integer NOT NULL DEFAULT 0,
  added_by_user_id   uuid NOT NULL,
  added_at           timestamptz NOT NULL DEFAULT now(),
  removed_at         timestamptz
);
CREATE UNIQUE INDEX stock_photos_once ON dealer.stock_photos (stock_item_id, evidence_id) WHERE removed_at IS NULL;

-- Per dealer settings: stock age alert levels (commercial, D-124) and the broker lead protection period (D-128).
CREATE TABLE dealer.settings (
  organisation_id      uuid PRIMARY KEY,
  stock_age_alert_days integer[] NOT NULL DEFAULT '{90,180,240}',
  lead_protection_days integer NOT NULL DEFAULT 30 CHECK (lead_protection_days BETWEEN 1 AND 365),
  updated_by_user_id   uuid,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_touch BEFORE UPDATE ON dealer.settings FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Costs, margins and dealer settings are for managers only; sales staff see asking prices.
INSERT INTO iam.permissions (code, description) VALUES
  ('dealer.costs.manage', 'See and record a dealer''s car costs and margins, and change dealer settings')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, 'dealer.costs.manage' FROM iam.roles r WHERE r.code IN ('org_manager', 'sazo_admin')
ON CONFLICT DO NOTHING;
