// Data access for the Dealer workspace. Owns the `dealer` schema.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export type StockStatus = 'in_stock' | 'sold' | 'removed';
export const IMPORT_STAGES = ['bought', 'shipping', 'at_port', 'in_bond', 'cleared', 'at_yard'] as const;
export type ImportStage = (typeof IMPORT_STAGES)[number];
export const CUSTOMS_STATUSES = ['not_entered', 'in_bond', 'assessed', 'duty_paid', 'released'] as const;
export const COST_CATEGORIES = ['purchase', 'freight_insurance', 'port_shipping', 'customs_taxes', 'clearing_agent', 'transport', 'inspection_repairs', 'registration_plates', 'other'] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

/** The car details a dealer can type or change (not price, status or history links). */
export interface StockDetails {
  make: string | null; model: string | null; modelYear: number | null; engineCc: number | null; fuel: string | null; transmission: string | null;
  colour: string | null; yard: string | null; stage: ImportStage; receivedOn: string | null; bondArrivedOn: string | null; customsStatus: string | null;
  customsDeadline: string | null; customsExtensionUntil: string | null; customsValueUgx: number | null; tiktokUrl: string | null;
  openToBrokers: boolean; commissionKind: 'fixed' | 'percent' | null; commissionFixedUgx: number | null; commissionPercent: number | null;
}
export interface StockRow extends StockDetails {
  id: string; organisationId: string; vehicleId: string | null; status: StockStatus; askingPriceUgx: number; listedMileageKm: number | null;
  notes: string | null; createdBy: string; listedAt: Date; soldAt: Date | null; salePriceUgx: number | null;
}
export interface CostRow {
  id: string; category: CostCategory; amount: number; currency: string; rateToUgx: number; amountUgx: number; note: string | null; shareRule: string | null;
  reversesEntryId: string | null; reversedBy: string | null; createdBy: string; createdAt: Date;
}
export interface PhotoRow { id: string; evidenceId: string; position: number; addedAt: Date }
export interface DealerSettings { stockAgeAlertDays: number[]; leadProtectionDays: number }

const DATE = (c: string, as: string) => `to_char(${c}, 'YYYY-MM-DD') AS "${as}"`;
const COLS = `id, organisation_id AS "organisationId", vehicle_id AS "vehicleId", status, asking_price_ugx::float8 AS "askingPriceUgx",
  listed_mileage_km AS "listedMileageKm", notes, created_by_user_id AS "createdBy", listed_at AS "listedAt", sold_at AS "soldAt",
  sale_price_ugx::float8 AS "salePriceUgx", make, model, model_year AS "modelYear", engine_cc AS "engineCc", fuel, transmission, colour, yard, stage,
  ${DATE('received_on', 'receivedOn')}, ${DATE('bond_arrived_on', 'bondArrivedOn')}, customs_status AS "customsStatus",
  ${DATE('customs_deadline', 'customsDeadline')}, ${DATE('customs_extension_until', 'customsExtensionUntil')}, customs_value_ugx::float8 AS "customsValueUgx",
  tiktok_url AS "tiktokUrl", open_to_brokers AS "openToBrokers", commission_kind AS "commissionKind", commission_fixed_ugx::float8 AS "commissionFixedUgx",
  commission_percent::float8 AS "commissionPercent"`;

/** Column for each detail field (whitelist: only these can be set by updateDetails). */
const DETAIL_COLUMNS: Record<keyof StockDetails, string> = {
  make: 'make', model: 'model', modelYear: 'model_year', engineCc: 'engine_cc', fuel: 'fuel', transmission: 'transmission', colour: 'colour', yard: 'yard',
  stage: 'stage', receivedOn: 'received_on', bondArrivedOn: 'bond_arrived_on', customsStatus: 'customs_status', customsDeadline: 'customs_deadline',
  customsExtensionUntil: 'customs_extension_until', customsValueUgx: 'customs_value_ugx', tiktokUrl: 'tiktok_url', openToBrokers: 'open_to_brokers',
  commissionKind: 'commission_kind', commissionFixedUgx: 'commission_fixed_ugx', commissionPercent: 'commission_percent',
};

@Injectable()
export class DealerRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async get(id: string, sql: Sql = this.pool): Promise<StockRow | undefined> {
    return (await sql.query<StockRow>(`SELECT ${COLS} FROM dealer.stock_items WHERE id = $1`, [id])).rows[0];
  }

  async live(organisationId: string, vehicleId: string): Promise<StockRow | undefined> {
    return (await this.pool.query<StockRow>(`SELECT ${COLS} FROM dealer.stock_items WHERE organisation_id = $1 AND vehicle_id = $2 AND status = 'in_stock'`, [organisationId, vehicleId])).rows[0];
  }

  /** Every car in stock at any dealer that is linked to a SAZO vehicle, newest first (callers filter to approved dealers). */
  async inStockEverywhere(limit: number, onlyOpenToBrokers = false): Promise<StockRow[]> {
    return (await this.pool.query<StockRow>(
      `SELECT ${COLS} FROM dealer.stock_items WHERE status = 'in_stock' AND vehicle_id IS NOT NULL
          AND (NOT $2 OR (open_to_brokers AND commission_kind IS NOT NULL)) ORDER BY listed_at DESC LIMIT $1`, [limit, onlyOpenToBrokers])).rows;
  }

  async list(organisationId: string, status: StockStatus | undefined): Promise<StockRow[]> {
    return (await this.pool.query<StockRow>(
      `SELECT ${COLS} FROM dealer.stock_items WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY (status = 'in_stock') DESC, listed_at DESC LIMIT 200`, [organisationId, status ?? null])).rows;
  }

  /** Returns undefined if the car is already in this dealer's stock (unique live index). */
  async insert(r: { organisationId: string; vehicleId: string | null; askingPriceUgx: number; listedMileageKm: number | null; notes: string | null; createdBy: string; details: Partial<StockDetails> }): Promise<StockRow | undefined> {
    const keys = (Object.keys(r.details) as (keyof StockDetails)[]).filter((k) => DETAIL_COLUMNS[k] && r.details[k] !== undefined);
    const cols = ['organisation_id', 'vehicle_id', 'asking_price_ugx', 'listed_mileage_km', 'notes', 'created_by_user_id', ...keys.map((k) => DETAIL_COLUMNS[k])];
    const vals = [r.organisationId, r.vehicleId, r.askingPriceUgx, r.listedMileageKm, r.notes, r.createdBy, ...keys.map((k) => r.details[k])];
    try {
      return (await this.pool.query<StockRow>(
        `INSERT INTO dealer.stock_items (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${COLS}`, vals)).rows[0];
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

  /** Change typed details of a car still in stock. Only whitelisted columns; returns false if the car left stock. */
  async updateDetails(id: string, d: Partial<StockDetails>): Promise<boolean> {
    const keys = (Object.keys(d) as (keyof StockDetails)[]).filter((k) => DETAIL_COLUMNS[k] && d[k] !== undefined);
    if (!keys.length) return true;
    const sets = keys.map((k, i) => `${DETAIL_COLUMNS[k]} = $${i + 2}`);
    const r = await this.pool.query(`UPDATE dealer.stock_items SET ${sets.join(', ')} WHERE id = $1 AND status = 'in_stock'`, [id, ...keys.map((k) => d[k])]);
    return r.rowCount === 1;
  }

  /** Link a car added without its chassis number to its SAZO vehicle. Undefined if already in stock under that vehicle. */
  async link(id: string, vehicleId: string, listedMileageKm: number | null): Promise<boolean | undefined> {
    try {
      const r = await this.pool.query(
        `UPDATE dealer.stock_items SET vehicle_id = $2, listed_mileage_km = COALESCE($3, listed_mileage_km), listed_at = now()
          WHERE id = $1 AND vehicle_id IS NULL AND status = 'in_stock'`, [id, vehicleId, listedMileageKm]);
      return r.rowCount === 1;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return undefined;
      throw err;
    }
  }

  async markSold(id: string, price: number, at: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE dealer.stock_items SET status = 'sold', sale_price_ugx = $2, sold_at = $3 WHERE id = $1 AND status = 'in_stock'`, [id, price, at]);
    return r.rowCount === 1;
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE dealer.stock_items SET status = 'removed', removed_at = now() WHERE id = $1 AND status = 'in_stock'`, [id]);
    return r.rowCount === 1;
  }

  // Costs -------------------------------------------------------------------------------------------------

  async costs(stockItemId: string): Promise<CostRow[]> {
    return (await this.pool.query<CostRow>(
      `SELECT c.id, c.category, c.amount::float8 AS amount, c.currency, c.rate_to_ugx::float8 AS "rateToUgx", c.amount_ugx::float8 AS "amountUgx", c.note,
              c.share_rule AS "shareRule", c.reverses_entry_id AS "reversesEntryId", r.id AS "reversedBy", c.created_by_user_id AS "createdBy", c.created_at AS "createdAt"
         FROM dealer.cost_entries c LEFT JOIN dealer.cost_entries r ON r.reverses_entry_id = c.id
        WHERE c.stock_item_id = $1 ORDER BY c.created_at, c.id`, [stockItemId])).rows;
  }

  /** Net landed cost in UGX per car: entries minus reversals. */
  async costTotals(stockItemIds: string[]): Promise<Map<string, number>> {
    if (!stockItemIds.length) return new Map();
    const { rows } = await this.pool.query<{ id: string; total: number }>(
      `SELECT stock_item_id AS id, sum(CASE WHEN reverses_entry_id IS NULL THEN amount_ugx ELSE -amount_ugx END)::float8 AS total
         FROM dealer.cost_entries WHERE stock_item_id = ANY($1) GROUP BY stock_item_id`, [stockItemIds]);
    return new Map(rows.map((r) => [r.id, r.total]));
  }

  async addCost(c: { organisationId: string; stockItemId: string; category: CostCategory; amount: number; currency: string; rateToUgx: number; amountUgx: number;
    note: string | null; shareRule: string | null; reversesEntryId: string | null; createdBy: string }): Promise<CostRow | undefined> {
    try {
      const { rows } = await this.pool.query<{ id: string }>(
        `INSERT INTO dealer.cost_entries (organisation_id, stock_item_id, category, amount, currency, rate_to_ugx, amount_ugx, note, share_rule, reverses_entry_id, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [c.organisationId, c.stockItemId, c.category, c.amount, c.currency, c.rateToUgx, c.amountUgx, c.note, c.shareRule, c.reversesEntryId, c.createdBy]);
      return (await this.costs(c.stockItemId)).find((x) => x.id === rows[0]!.id);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return undefined; // already reversed
      throw err;
    }
  }

  // Photos ------------------------------------------------------------------------------------------------

  async photos(stockItemIds: string[]): Promise<Map<string, PhotoRow[]>> {
    const out = new Map<string, PhotoRow[]>();
    if (!stockItemIds.length) return out;
    const { rows } = await this.pool.query<PhotoRow & { stockItemId: string }>(
      `SELECT id, stock_item_id AS "stockItemId", evidence_id AS "evidenceId", position, added_at AS "addedAt" FROM dealer.stock_photos
        WHERE stock_item_id = ANY($1) AND removed_at IS NULL ORDER BY position, added_at`, [stockItemIds]);
    for (const r of rows) {
      const { stockItemId, ...p } = r;
      out.set(stockItemId, [...(out.get(stockItemId) ?? []), p]);
    }
    return out;
  }

  async addPhoto(p: { organisationId: string; stockItemId: string; evidenceId: string; addedBy: string }): Promise<PhotoRow | undefined> {
    try {
      return (await this.pool.query<PhotoRow>(
        `INSERT INTO dealer.stock_photos (organisation_id, stock_item_id, evidence_id, position, added_by_user_id)
         VALUES ($1, $2, $3, (SELECT COALESCE(max(position) + 1, 0) FROM dealer.stock_photos WHERE stock_item_id = $2 AND removed_at IS NULL), $4)
         RETURNING id, evidence_id AS "evidenceId", position, added_at AS "addedAt"`, [p.organisationId, p.stockItemId, p.evidenceId, p.addedBy])).rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return undefined;
      throw err;
    }
  }

  async photoCount(stockItemId: string): Promise<number> {
    return (await this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM dealer.stock_photos WHERE stock_item_id = $1 AND removed_at IS NULL`, [stockItemId])).rows[0]!.n;
  }

  async removePhoto(stockItemId: string, photoId: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE dealer.stock_photos SET removed_at = now() WHERE id = $1 AND stock_item_id = $2 AND removed_at IS NULL`, [photoId, stockItemId]);
    return r.rowCount === 1;
  }

  // Settings ----------------------------------------------------------------------------------------------

  async settings(organisationId: string): Promise<DealerSettings> {
    const r = (await this.pool.query<DealerSettings>(
      `SELECT stock_age_alert_days AS "stockAgeAlertDays", lead_protection_days AS "leadProtectionDays" FROM dealer.settings WHERE organisation_id = $1`, [organisationId])).rows[0];
    return r ?? { stockAgeAlertDays: [90, 180, 240], leadProtectionDays: 30 };
  }

  async saveSettings(organisationId: string, s: DealerSettings, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO dealer.settings (organisation_id, stock_age_alert_days, lead_protection_days, updated_by_user_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (organisation_id) DO UPDATE SET stock_age_alert_days = $2, lead_protection_days = $3, updated_by_user_id = $4`,
      [organisationId, s.stockAgeAlertDays, s.leadProtectionDays, userId]);
  }
}
