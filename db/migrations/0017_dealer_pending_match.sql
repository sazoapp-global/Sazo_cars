-- 0017 A dealer's car SAZO does not know is never refused (D-130). With a plate or chassis number it is added
-- to SAZO at once (provisional, P-010). When SAZO has to check which car it is first (the plate or chassis
-- matches an unconfirmed record, S24), the car still goes into the dealer's stock and waits here for the
-- reviewer; it joins SAZO by itself once the reviewer has matched it.
ALTER TABLE dealer.stock_items ADD COLUMN pending_submission_id uuid;   -- ingest.submissions, waiting for a reviewer
CREATE INDEX stock_items_pending ON dealer.stock_items (organisation_id) WHERE pending_submission_id IS NOT NULL;
