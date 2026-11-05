// Fill in the category (D-163) of test cars added before categories: New, Imported used or Ugandan used.
// Only cars with no category are changed; the rule reads what the dealer already recorded about each car:
//   1. still on its way or in the bond (bought, shipping, at the port, in the bond, cleared): Imported used;
//   2. at the yard with import costs (freight, customs taxes, or a price paid in another currency): Imported used;
//   3. at the yard, this year's or last year's model, no mileage recorded: New;
//   4. any other car at the yard (bought in Uganda in shillings): Ugandan used.
import type pg from 'pg';

export async function fillCategories(pool: pg.Pool): Promise<{ category: string; cars: number }[]> {
  const res = await pool.query<{ category: string; cars: number }>(`
    WITH imported AS (
      SELECT DISTINCT stock_item_id FROM dealer.cost_entries
       WHERE category IN ('freight_insurance', 'port_shipping', 'customs_taxes', 'clearing_agent') OR currency <> 'UGX'
    ), picked AS (
      SELECT s.id,
             CASE WHEN s.stage IN ('bought', 'shipping', 'at_port', 'in_bond', 'cleared') THEN 'foreign_used'
                  WHEN s.id IN (SELECT stock_item_id FROM imported) THEN 'foreign_used'
                  WHEN s.model_year >= extract(year FROM now())::int - 1 AND s.listed_mileage_km IS NULL THEN 'new'
                  ELSE 'ug_used' END AS category
        FROM dealer.stock_items s WHERE s.category IS NULL
    ), done AS (
      UPDATE dealer.stock_items s SET category = p.category FROM picked p WHERE s.id = p.id RETURNING s.category
    )
    SELECT category, count(*)::int AS cars FROM done GROUP BY category ORDER BY category`);
  return res.rows;
}
