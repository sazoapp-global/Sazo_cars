-- Who marked a car as sold (27 Oct 2026). The dealer dashboard counts a salesperson's sales from this and from
-- the enquiries they brought to a completed sale. Older sales have no value here and count by enquiry only.
ALTER TABLE dealer.stock_items ADD COLUMN sold_by_user_id uuid;
