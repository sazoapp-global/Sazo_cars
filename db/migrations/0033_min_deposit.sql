-- The lowest deposit a dealer wants on an instalment sale, as a share of the price (D-190, 18 Nov 2026).
-- NULL: no minimum. The sale form warns below it; it does not stop the sale.
ALTER TABLE dealer.settings ADD COLUMN min_deposit_percent integer CHECK (min_deposit_percent BETWEEN 1 AND 100);
