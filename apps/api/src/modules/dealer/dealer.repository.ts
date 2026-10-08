// Data access for the Dealer workspace. Owns the `dealer` schema.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';

export type StockStatus = 'in_stock' | 'sold' | 'removed';
export interface StockRow {
  id: string; organisationId: string; vehicleId: string; status: StockStatus; askingPriceUgx: number; listedMileageKm: number | null;
  notes: string | null; createdBy: string; listedAt: Date; soldAt: Date | null; salePriceUgx: number | null;
}
const COLS = `id, organisation_id AS "organisationId", vehicle_id AS "vehicleId", status, asking_price_ugx::float8 AS "askingPriceUgx",
  listed_mileage_km AS "listedMileageKm", notes, created_by_user_id AS "createdBy", listed_at AS "listedAt", sold_at AS "soldAt",
  sale_price_ugx::float8 AS "salePriceUgx"`;

@Injectable()
export class DealerRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async get(id: string): Promise<StockRow | undefined> {
    return (await this.pool.query<StockRow>(`SELECT ${COLS} FROM dealer.stock_items WHERE id = $1`, [id])).rows[0];
  }

  async live(organisationId: string, vehicleId: string): Promise<StockRow | undefined> {
    return (await this.pool.query<StockRow>(`SELECT ${COLS} FROM dealer.stock_items WHERE organisation_id = $1 AND vehicle_id = $2 AND status = 'in_stock'`, [organisationId, vehicleId])).rows[0];
  }

  async list(organisationId: string, status: StockStatus | undefined): Promise<StockRow[]> {
    return (await this.pool.query<StockRow>(
      `SELECT ${COLS} FROM dealer.stock_items WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY (status = 'in_stock') DESC, listed_at DESC LIMIT 200`, [organisationId, status ?? null])).rows;
  }

  /** Returns undefined if the car is already in this dealer's stock (unique live index). */
  async insert(r: { organisationId: string; vehicleId: string; askingPriceUgx: number; listedMileageKm: number | null; notes: string | null; createdBy: string }): Promise<StockRow | undefined> {
    try {
      return (await this.pool.query<StockRow>(
        `INSERT INTO dealer.stock_items (organisation_id, vehicle_id, asking_price_ugx, listed_mileage_km, notes, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
        [r.organisationId, r.vehicleId, r.askingPriceUgx, r.listedMileageKm, r.notes, r.createdBy])).rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return undefined;
      throw err;
    }
  }

  async listedToday(organisationId: string): Promise<number> {
    return (await this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM dealer.stock_items WHERE organisation_id = $1 AND listed_at > now() - interval '1 day'`, [organisationId])).rows[0]!.n;
  }

  async setPrice(id: string, price: number): Promise<void> {
    await this.pool.query(`UPDATE dealer.stock_items SET asking_price_ugx = $2 WHERE id = $1 AND status = 'in_stock'`, [id, price]);
  }

  async markSold(id: string, price: number, at: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE dealer.stock_items SET status = 'sold', sale_price_ugx = $2, sold_at = $3 WHERE id = $1 AND status = 'in_stock'`, [id, price, at]);
    return r.rowCount === 1;
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE dealer.stock_items SET status = 'removed', removed_at = now() WHERE id = $1 AND status = 'in_stock'`, [id]);
    return r.rowCount === 1;
  }
}
