-- The kind of car and the other car details (D-148, 27 Oct 2026).
--   1. SAZO's model list (reference knowledge, D-015) gets the kind and the maker's figures for each model; each
--      car takes them from its model unless a registry, dealer or inspector says otherwise. Until real maker
--      specifications are loaded the figures are test data (spec_basis 'simulated').
--   2. A dealer's car keeps the kind and the optional details the dealer typed.
--   3. SAZO admins set the kind when SAZO cannot tell it, or when sources disagree. Decisions are never edited.
--   4. Confirmed owners log fill-ups; the report shows the owners' average km per litre from 3 measured tanks.

ALTER TABLE ref.vehicle_models
  ADD COLUMN kind          text CHECK (kind IN ('saloon','hatchback','station_wagon','suv','pickup','van','minibus','bus','truck','coupe_convertible','other')),
  ADD COLUMN engine_cc     int CHECK (engine_cc > 0),
  ADD COLUMN seats         int CHECK (seats BETWEEN 1 AND 120),
  ADD COLUMN doors         int CHECK (doors BETWEEN 0 AND 8),
  ADD COLUMN cylinders     int CHECK (cylinders BETWEEN 1 AND 16),
  ADD COLUMN power_hp      int CHECK (power_hp > 0),
  ADD COLUMN fuel_km_per_l numeric(4,1) CHECK (fuel_km_per_l > 0),
  ADD COLUMN load_tonnes   numeric(5,2) CHECK (load_tonnes >= 0),
  ADD COLUMN gvw_tonnes    numeric(5,2) CHECK (gvw_tonnes > 0),
  ADD COLUMN axles         int CHECK (axles BETWEEN 2 AND 10),
  ADD COLUMN drive         text CHECK (drive IN ('2wd','4wd','awd')),
  ADD COLUMN spec_basis    text NOT NULL DEFAULT 'simulated' CHECK (spec_basis IN ('simulated','maker'));

ALTER TABLE dealer.stock_items
  ADD COLUMN kind  text CHECK (kind IN ('saloon','hatchback','station_wagon','suv','pickup','van','minibus','bus','truck','coupe_convertible','other')),
  ADD COLUMN specs jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX ON dealer.stock_items (organisation_id, kind);

CREATE TABLE vehicle.kind_decisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id          uuid NOT NULL REFERENCES vehicle.vehicles(id),
  kind                text NOT NULL CHECK (kind IN ('saloon','hatchback','station_wagon','suv','pickup','van','minibus','bus','truck','coupe_convertible','other')),
  reason              text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  decided_by_user_id  uuid NOT NULL,
  decided_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON vehicle.kind_decisions (vehicle_id, decided_at DESC);
SELECT platform.append_only('vehicle.kind_decisions');

CREATE TABLE report.fuel_fillups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   uuid NOT NULL,                  -- vehicle.vehicles
  user_id      uuid NOT NULL,                  -- iam.users (a confirmed owner when logged)
  filled_on    date NOT NULL,
  litres       numeric(6,2) NOT NULL CHECK (litres > 0 AND litres <= 1000),
  odometer_km  int NOT NULL CHECK (odometer_km >= 0),
  full_tank    boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  removed_at   timestamptz                     -- the owner took it back (a mistake); kept for the record
);
CREATE INDEX ON report.fuel_fillups (vehicle_id, odometer_km) WHERE removed_at IS NULL;
CREATE INDEX ON report.fuel_fillups (user_id, vehicle_id) WHERE removed_at IS NULL;

INSERT INTO iam.permissions (code, description) VALUES ('vehicle.kind.decide', 'Set the kind of car when SAZO cannot tell it or sources disagree')
ON CONFLICT (code) DO NOTHING;
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, 'vehicle.kind.decide' FROM iam.roles r WHERE r.code = 'sazo_admin'
ON CONFLICT DO NOTHING;

-- D-147: people's data is downloaded as PDF or Excel, never JSON.
UPDATE iam.permissions SET description = 'Download a person''s data as a PDF or Excel file' WHERE code = 'user.data.export';
