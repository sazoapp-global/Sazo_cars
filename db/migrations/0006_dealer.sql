-- 0006 — Dealer workspace (P-005): a dealer keeps a list of the cars it is selling, records the asking price,
-- the mileage when listed and the sale, and makes report links for buyers. Listings and sales are sent through
-- Ingestion on the dealer's own source (evidence class "dealer"), so they become part of each car's history.

CREATE SCHEMA dealer;

CREATE TABLE dealer.stock_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL,                     -- iam.organisations (type dealer)
  vehicle_id          uuid NOT NULL,                     -- vehicle.vehicles
  status              text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','sold','removed')),
  asking_price_ugx    bigint NOT NULL CHECK (asking_price_ugx > 0),
  listed_mileage_km   integer CHECK (listed_mileage_km >= 0),
  notes               text,
  created_by_user_id  uuid NOT NULL,
  listed_at           timestamptz NOT NULL DEFAULT now(),
  sold_at             timestamptz,
  sale_price_ugx      bigint CHECK (sale_price_ugx > 0),  -- confidential: never shown to buyers
  removed_at          timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'sold' OR (sold_at IS NOT NULL AND sale_price_ugx IS NOT NULL))
);
-- A car is in a dealer's stock at most once at a time.
CREATE UNIQUE INDEX stock_items_live ON dealer.stock_items (organisation_id, vehicle_id) WHERE status = 'in_stock';
CREATE INDEX ON dealer.stock_items (organisation_id, status, listed_at DESC);
CREATE TRIGGER trg_touch BEFORE UPDATE ON dealer.stock_items FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

INSERT INTO iam.permissions (code, description) VALUES
  ('dealer.stock.manage', 'Manage a dealer''s cars for sale, prices and sales')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, 'dealer.stock.manage' FROM iam.roles r WHERE r.code IN ('org_manager', 'org_staff')
ON CONFLICT DO NOTHING;
