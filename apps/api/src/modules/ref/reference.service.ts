// Reference & Intelligence — module 9 (minimal for the first slice): vehicle models, market comparables
// (for valuation status) and stored Vehicle Health results. Owns the `ref` schema.
import { Inject, Injectable } from '@nestjs/common';
import type { HealthResult } from '@sazo/trust-engine';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

@Injectable()
export class ReferenceService {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async ensureModel(make: string, model: string, generation: string, yearFrom: number, yearTo?: number, modelCodes: string[] = []): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO ref.vehicle_models (make, model, generation, year_from, year_to, model_codes) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (make, model, generation) DO UPDATE SET year_to = EXCLUDED.year_to RETURNING id`,
      [make, model, generation, yearFrom, yearTo ?? null, modelCodes],
    );
    return rows[0]!.id;
  }

  /** Seed/demo helper: add simulated comparable sales (basis = 'simulated', D-011). */
  async addSimulatedComparables(modelId: string, year: number, count: number, priceUgx: number, soldOn: string): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.pool.query(
        `INSERT INTO ref.market_comparables (model_id, year, mileage_km, price_ugx, sold_on, basis, data_version) VALUES ($1,$2,$3,$4,$5,'simulated',1)`,
        [modelId, year, 60000 + i * 5000, Math.round(priceUgx * (0.9 + (i % 5) * 0.05)), soldOn],
      );
    }
  }

  /** Comparable sales: same make/model, year ±2, sold in the 12 months before `asOf` (Rule Set §10). */
  async comparablesCount(make: string | undefined, model: string | undefined, year: number | undefined, asOf: string): Promise<number> {
    if (!make || !model || !year) return 0;
    const { rows } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ref.market_comparables c JOIN ref.vehicle_models m ON m.id = c.model_id
        WHERE lower(m.make) = lower($1) AND lower(m.model) = lower($2) AND c.year BETWEEN $3 - 2 AND $3 + 2
          AND c.sold_on > ($4::timestamptz - interval '12 months') AND c.sold_on <= $4::timestamptz`,
      [make, model, year, asOf],
    );
    return rows[0]!.n;
  }

  async saveHealth(sql: Sql, h: { vehicleId: string; runId: string; ruleSetVersion: string; asOf: string; health: HealthResult }): Promise<void> {
    await sql.query(
      `INSERT INTO ref.vehicle_health (vehicle_id, trust_run_id, rule_set_version, as_of, insufficient, score, band, deductions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [h.vehicleId, h.runId, h.ruleSetVersion, h.asOf, h.health.insufficient, h.health.score, h.health.band, JSON.stringify(h.health.deductions)],
    );
  }

  async healthForRun(runId: string): Promise<HealthResult | undefined> {
    const { rows } = await this.pool.query<{ insufficient: boolean; score: number | null; band: HealthResult['band']; deductions: HealthResult['deductions'] }>(
      'SELECT insufficient, score, band, deductions FROM ref.vehicle_health WHERE trust_run_id = $1', [runId]);
    return rows[0];
  }
}
