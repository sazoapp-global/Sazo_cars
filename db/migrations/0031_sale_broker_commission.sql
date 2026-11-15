-- Naming the broker at the sale, and commission due at the first payment (D-185, 15 Nov 2026).
-- A commission now waits for the buyer's first payment (the deposit, or the full price in cash) before it goes to a
-- manager to approve.
ALTER TABLE dealer.commissions DROP CONSTRAINT commissions_status_check;
ALTER TABLE dealer.commissions ADD CONSTRAINT commissions_status_check
  CHECK (status IN ('awaiting_payment','on_hold','pending','approved','paid','cancelled'));
