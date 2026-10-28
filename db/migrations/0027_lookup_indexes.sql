-- Indexes for lookups that scanned whole tables (28 Oct 2026): each column below is looked up by the API but had no
-- index, so the lookup reads every row and slows down as the table grows.
-- A business's latest verification case (the business list and the verification pages).
CREATE INDEX ON iam.verification_cases (organisation_id, created_at DESC);
-- The leads on one car (the dealer dashboard checks this for every car in stock).
CREATE INDEX ON dealer.leads (stock_item_id);
-- A person's consents, checked before every consent is recorded or a message is sent.
CREATE INDEX ON pii.party_consents (party_id, purpose);
-- A conflict's history (the conflict page).
CREATE INDEX ON trust.conflict_activities (conflict_id, at);
