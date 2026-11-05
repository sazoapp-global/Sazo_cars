-- A dealer's car category (D-163, 5 Nov 2026): new from the factory, used abroad and imported, or used in Uganda.
-- Optional so cars added before it keep working; `npm run seed:categories -w @sazo/api` fills it in for test data.
ALTER TABLE dealer.stock_items
  ADD COLUMN category text CHECK (category IN ('new', 'foreign_used', 'ug_used'));
CREATE INDEX ON dealer.stock_items (organisation_id, category);
