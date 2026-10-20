-- 0020 Use cases P-05 and I-07.
--
-- P-05  A data partner corrects or withdraws a record it already sent. A correction is a new record that
--       "corrects" the old one; a withdrawal is a "retracts" relation with the sender's reason and no new record.
--       The old record is never edited and stays in the history, marked corrected or withdrawn (D-020).
-- I-07  A buyer asks an approved inspector or inspection centre to check a car. The inspector accepts with a
--       date and time, or declines with a reason; the buyer can cancel. No money moves through SAZO.

ALTER TABLE obs.observation_relations ALTER COLUMN from_observation_id DROP NOT NULL;
ALTER TABLE obs.observation_relations ADD CONSTRAINT observation_relations_from_needed
  CHECK (from_observation_id IS NOT NULL OR kind = 'retracts');
-- One withdrawal per record.
CREATE UNIQUE INDEX observation_relations_one_withdrawal ON obs.observation_relations (to_observation_id) WHERE from_observation_id IS NULL;

CREATE TABLE inspection.bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id        uuid NOT NULL,                 -- iam.users
  organisation_id      uuid NOT NULL,                 -- iam.organisations (inspector or inspection centre)
  vehicle_id           uuid,                          -- vehicle.vehicles, when the car is known to SAZO
  plate                text NOT NULL CHECK (length(plate) BETWEEN 2 AND 15),
  preferred_date       date NOT NULL,
  place                text CHECK (length(place) <= 120),   -- where the car is
  note                 text CHECK (length(note) <= 500),
  status               text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','cancelled','done')),
  scheduled_at         timestamptz,
  response_note        text CHECK (length(response_note) <= 500),
  responded_by_user_id uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'accepted' OR scheduled_at IS NOT NULL)
);
CREATE INDEX bookings_org ON inspection.bookings (organisation_id, status, preferred_date);
CREATE INDEX bookings_buyer ON inspection.bookings (buyer_user_id, created_at DESC);
CREATE TRIGGER trg_touch BEFORE UPDATE ON inspection.bookings FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();
