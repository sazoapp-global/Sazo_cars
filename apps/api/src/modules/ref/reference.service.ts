// Reference & Intelligence — module 9 (minimal for the first slice): vehicle models, market comparables
// (for valuation status) and stored Vehicle Health results. Owns the `ref` schema.
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { chassisCode, type Drive, type VehicleKind } from '@sazo/contracts';
import type { HealthResult } from '@sazo/trust-engine';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { MIXED_KIND_MODELS, MODEL_SPECS } from './model-specs.js';

export interface ModelRef { modelId: string; make: string; model: string; generation: string; yearFrom: number; yearTo: number | null }
/** "Toyota Harrier" or "Toyota Harrier XU60 (2013–2020)". */
export const modelLabel = (m: Pick<ModelRef, 'make' | 'model' | 'generation'>) => [m.make, m.model, m.generation === 'all' ? '' : m.generation].filter(Boolean).join(' ');

/** A model's kind and maker's figures (D-148). `basis` 'simulated' = test data until real maker specifications are loaded. */
export interface ModelSpecRow {
  modelId: string; make: string; model: string; kind: VehicleKind | null; codes: string[]; yearFrom: number; yearTo: number | null;
  engineCc: number | null; seats: number | null; doors: number | null; cylinders: number | null; powerHp: number | null; fuelKmPerL: number | null;
  loadTonnes: number | null; gvwTonnes: number | null; axles: number | null; drive: Drive | null; basis: 'simulated' | 'maker';
}

/** What SAZO could tell about a car's kind from its chassis code or model (D-148). */
export type Identification =
  | { kind: VehicleKind; via: 'chassis_code' | 'model'; spec?: ModelSpecRow; code?: string }
  | { kind?: undefined; reason: 'mixed_model' | 'unknown_model' | 'no_model'; kinds?: VehicleKind[]; spec?: ModelSpecRow };

const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();

@Injectable()
export class ReferenceService implements OnModuleInit {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  private specs: ModelSpecRow[] = [];

  /** Load SAZO's model list (kind and maker's figures) into the database and memory. Safe to run every start. */
  async onModuleInit(): Promise<void> {
    for (const m of MODEL_SPECS) {
      await this.pool.query(
        `INSERT INTO ref.vehicle_models (make, model, generation, year_from, model_codes, kind, engine_cc, seats, doors, cylinders, power_hp,
                fuel_km_per_l, load_tonnes, gvw_tonnes, axles, drive, spec_basis)
         VALUES ($1,$2,'all',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'simulated')
         ON CONFLICT (make, model, generation) DO UPDATE SET model_codes = EXCLUDED.model_codes, kind = EXCLUDED.kind, engine_cc = EXCLUDED.engine_cc,
           seats = EXCLUDED.seats, doors = EXCLUDED.doors, cylinders = EXCLUDED.cylinders, power_hp = EXCLUDED.power_hp, fuel_km_per_l = EXCLUDED.fuel_km_per_l,
           load_tonnes = EXCLUDED.load_tonnes, gvw_tonnes = EXCLUDED.gvw_tonnes, axles = EXCLUDED.axles, drive = EXCLUDED.drive
         WHERE ref.vehicle_models.spec_basis = 'simulated'`,
        [m.make, m.model, m.yearFrom, m.codes, m.kind, m.engineCc ?? null, m.seats ?? null, m.doors ?? null, m.cylinders ?? null, m.powerHp ?? null,
          m.fuelKmPerL ?? null, m.loadTonnes ?? null, m.gvwTonnes ?? null, m.axles ?? null, m.drive ?? null]);
    }
    await this.loadSpecs();
  }

  async loadSpecs(): Promise<void> {
    const { rows } = await this.pool.query<ModelSpecRow>(
      `SELECT id AS "modelId", make, model, kind, model_codes AS codes, year_from AS "yearFrom", year_to AS "yearTo", engine_cc AS "engineCc", seats, doors,
              cylinders, power_hp AS "powerHp", fuel_km_per_l::float8 AS "fuelKmPerL", load_tonnes::float8 AS "loadTonnes", gvw_tonnes::float8 AS "gvwTonnes",
              axles, drive, spec_basis AS basis
         FROM ref.vehicle_models WHERE kind IS NOT NULL`);
    this.specs = rows;
  }

  /**
   * The kind of a car from its chassis code, then its make and model (D-148). A code shared by two kinds, or a model
   * name that covers several (Corolla, Land Cruiser, Hiace), gives no kind: a person decides.
   */
  identify(car: { make?: string | null; model?: string | null; chassis?: string | null }): Identification {
    const make = norm(car.make), model = norm(car.model);
    const code = chassisCode(car.chassis);
    const sameName = (r: ModelSpecRow) => norm(r.model) === model || norm(r.model) === `corolla ${model}` || `corolla ${norm(r.model)}` === model;
    const named = model ? this.specs.filter((r) => (!make || norm(r.make) === make) && sameName(r)) : [];
    const mixed = model ? MIXED_KIND_MODELS.find((m) => (!make || norm(m.make) === make) && norm(m.model) === model) : undefined;
    if (code) {
      let byCode = this.specs.filter((r) => r.codes.includes(code) && (!make || norm(r.make) === make));
      const both = byCode.filter((r) => named.includes(r));
      if (both.length) byCode = both;
      const kinds = [...new Set(byCode.map((r) => r.kind!))];
      if (kinds.length === 1) return { kind: kinds[0]!, via: 'chassis_code', spec: named.find((r) => byCode.includes(r)) ?? byCode[0], code };
    }
    if (mixed) return { reason: 'mixed_model', kinds: mixed.kinds, ...(named[0] ? { spec: named[0] } : {}) };
    const kinds = [...new Set(named.map((r) => r.kind!))];
    if (kinds.length === 1) return { kind: kinds[0]!, via: 'model', spec: named[0] };
    if (kinds.length > 1) return { reason: 'mixed_model', kinds };
    return { reason: model ? 'unknown_model' : 'no_model' };
  }

  async ensureModel(make: string, model: string, generation: string, yearFrom: number, yearTo?: number, modelCodes: string[] = []): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO ref.vehicle_models (make, model, generation, year_from, year_to, model_codes) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (make, model, generation) DO UPDATE SET year_to = EXCLUDED.year_to RETURNING id`,
      [make, model, generation, yearFrom, yearTo ?? null, modelCodes],
    );
    return rows[0]!.id;
  }

  /** The model (and generation) a car belongs to, for model-level reviews and creator videos (D-063). */
  async findModel(make: string | undefined, model: string | undefined, year: number | undefined): Promise<ModelRef | undefined> {
    if (!make || !model) return undefined;
    const { rows } = await this.pool.query<ModelRef>(
      `SELECT id AS "modelId", make, model, generation, year_from AS "yearFrom", year_to AS "yearTo" FROM ref.vehicle_models
        WHERE lower(make) = lower($1) AND lower(model) = lower($2)
        ORDER BY ($3::int IS NOT NULL AND $3 BETWEEN year_from AND COALESCE(year_to, 9999)) DESC, (generation = 'all'), year_from DESC LIMIT 1`,
      [make, model, year ?? null]);
    return rows[0];
  }

  async model(id: string): Promise<ModelRef | undefined> {
    const { rows } = await this.pool.query<ModelRef>(
      `SELECT id AS "modelId", make, model, generation, year_from AS "yearFrom", year_to AS "yearTo" FROM ref.vehicle_models WHERE id = $1`, [id]);
    return rows[0];
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

  /**
   * Estimated price range from the same comparables (D-060): the middle half of comparable sale prices
   * (25th–75th percentile) and the median, rounded to UGX 100,000. Always shown as an estimate with its basis.
   */
  async valuationRange(make: string | undefined, model: string | undefined, year: number | undefined, asOf: string): Promise<{ lowUgx: number; midUgx: number; highUgx: number; comparables: number } | undefined> {
    if (!make || !model || !year) return undefined;
    const { rows } = await this.pool.query<{ low: string; mid: string; high: string; n: number }>(
      `SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY c.price_ugx) AS low, percentile_cont(0.5) WITHIN GROUP (ORDER BY c.price_ugx) AS mid,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY c.price_ugx) AS high, count(*)::int AS n
         FROM ref.market_comparables c JOIN ref.vehicle_models m ON m.id = c.model_id
        WHERE lower(m.make) = lower($1) AND lower(m.model) = lower($2) AND c.year BETWEEN $3 - 2 AND $3 + 2
          AND c.sold_on > ($4::timestamptz - interval '12 months') AND c.sold_on <= $4::timestamptz`,
      [make, model, year, asOf]);
    const r = rows[0];
    if (!r || !r.n) return undefined;
    const round = (v: string) => Math.round(Number(v) / 100_000) * 100_000;
    return { lowUgx: round(r.low), midUgx: round(r.mid), highUgx: round(r.high), comparables: r.n };
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
