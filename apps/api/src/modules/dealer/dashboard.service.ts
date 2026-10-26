// The dealer's dashboard (D-146): cards that open each part of the console, and cars sold per month for the last
// 12 months. Managers see money (sales value, amounts owed, late payments, commission to approve); sales staff see
// counts only.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';
import { DealerRepository } from './dealer.repository.js';
import { PaymentsService, kampalaToday } from './payments.service.js';

/** The 12 months up to and including this one, oldest first, as YYYY-MM. */
export function lastMonths(today: string, n = 12): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - k), 1));
    return d.toISOString().slice(0, 7);
  });
}

@Injectable()
export class DealerDashboardService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(DealerRepository) private readonly repo: DealerRepository,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  async summary(organisationId: string, userId: string, manager: boolean, today = kampalaToday()) {
    const months = lastMonths(today);
    const thisMonth = months[months.length - 1]!;
    const settings = await this.repo.settings(organisationId);
    const oldAfter = settings.stockAgeAlertDays[0] ?? 90;
    const q = <T extends pg.QueryResultRow>(sql: string, params: unknown[]) => this.pool.query<T>(sql, params).then((r) => r.rows);
    const [[stock], sold, [enq], [mine], [links]] = await Promise.all([
      q<{ n: number; old: number }>(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE COALESCE(received_on, (listed_at AT TIME ZONE 'Africa/Kampala')::date) <= $2::date - $3::int)::int AS old
           FROM dealer.stock_items WHERE organisation_id = $1 AND status = 'in_stock'`, [organisationId, today, oldAfter]),
      q<{ month: string; n: number; value: number; instalments: number }>(
        `SELECT to_char(s.sold_at AT TIME ZONE 'Africa/Kampala', 'YYYY-MM') AS month, count(*)::int AS n, COALESCE(sum(s.sale_price_ugx), 0)::float8 AS value,
                count(p.id) FILTER (WHERE p.kind = 'instalments')::int AS instalments
           FROM dealer.stock_items s LEFT JOIN dealer.payment_plans p ON p.stock_item_id = s.id
          WHERE s.organisation_id = $1 AND s.status = 'sold' AND s.sold_at AT TIME ZONE 'Africa/Kampala' >= $2::date
          GROUP BY 1`, [organisationId, `${months[0]}-01`]),
      q<{ open: number; fresh: number; viewings: number }>(
        `SELECT count(*) FILTER (WHERE stage NOT IN ('completed', 'lost'))::int AS open, count(*) FILTER (WHERE stage = 'enquiry')::int AS fresh,
                count(*) FILTER (WHERE stage = 'viewing')::int AS viewings
           FROM dealer.leads WHERE organisation_id = $1`, [organisationId]),
      q<{ year: number; month: number }>(
        `SELECT count(*) FILTER (WHERE closed_at AT TIME ZONE 'Africa/Kampala' >= date_trunc('year', $3::date))::int AS year,
                count(*) FILTER (WHERE to_char(closed_at AT TIME ZONE 'Africa/Kampala', 'YYYY-MM') = $4)::int AS month
           FROM dealer.leads WHERE organisation_id = $1 AND created_by_user_id = $2 AND stage = 'completed'`, [organisationId, userId, today, thisMonth]),
      q<{ n: number }>(`SELECT count(*)::int AS n FROM dealer.car_links WHERE organisation_id = $1 AND revoked_at IS NULL`, [organisationId]),
    ]);
    const byMonth = new Map(sold.map((r) => [r.month, r]));
    const monthly = months.map((m) => ({ month: m, cars: byMonth.get(m)?.n ?? 0, ...(manager ? { valueUgx: byMonth.get(m)?.value ?? 0 } : {}) }));
    const now = byMonth.get(thisMonth);
    const base = {
      manager,
      month: thisMonth,
      stock: { count: stock?.n ?? 0, olderThanDays: oldAfter, older: stock?.old ?? 0 },
      soldThisMonth: { cars: now?.n ?? 0, ...(manager ? { valueUgx: now?.value ?? 0, onInstalments: now?.instalments ?? 0 } : {}) },
      enquiries: { open: enq?.open ?? 0, waiting: enq?.fresh ?? 0, viewings: enq?.viewings ?? 0 },
      mySales: { thisMonth: mine?.month ?? 0, thisYear: mine?.year ?? 0 },
      shareLinks: links?.n ?? 0,
      monthly,
    };
    if (!manager) return base;
    const [pay, [comm]] = await Promise.all([
      this.payments.list(organisationId, 'owing', today),
      q<{ n: number; amount: number }>(
        `SELECT count(*)::int AS n, COALESCE(sum(amount_ugx), 0)::float8 AS amount FROM dealer.commissions WHERE organisation_id = $1 AND status = 'pending'`, [organisationId]),
    ]);
    const soon = pay.items
      .filter((i) => i.next && (i.state === 'late' || i.next.status === 'due_soon'))
      .sort((a, b) => (a.state === 'late' ? 0 : 1) - (b.state === 'late' ? 0 : 1) || a.next!.dueOn.localeCompare(b.next!.dueOn))
      .slice(0, 5)
      .map((i) => ({ planId: i.planId, car: i.car, buyer: i.buyer, state: i.state, daysLate: i.daysLate, lateUgx: i.lateUgx, next: i.next }));
    return {
      ...base,
      payments: { owedUgx: pay.summary.owedUgx, owingSales: pay.summary.owingSales, lateUgx: pay.summary.lateUgx, lateBuyers: pay.summary.lateBuyers, dueSoon: soon },
      commissions: { toApprove: comm?.n ?? 0, amountUgx: comm?.amount ?? 0 },
    };
  }
}
