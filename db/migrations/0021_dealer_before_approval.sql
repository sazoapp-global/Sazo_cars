-- A dealer waiting for SAZO's approval can prepare their stock privately (25 Oct 2026). A car added with its plate
-- or chassis number keeps them here, with the mileage and odometer photo if given, and nothing goes to SAZO. Once
-- the business is approved the car is sent to SAZO by itself and these are cleared.
ALTER TABLE dealer.stock_items
  ADD COLUMN held_identifiers       jsonb,   -- {plate, vin, chassisNumber, vehicleRef} as the dealer typed them
  ADD COLUMN held_mileage_km        integer CHECK (held_mileage_km >= 0),
  ADD COLUMN held_odometer_photo_id uuid;    -- obs.evidence_files, uploaded by someone at this dealer
CREATE INDEX stock_items_held ON dealer.stock_items (organisation_id) WHERE held_identifiers IS NOT NULL;
