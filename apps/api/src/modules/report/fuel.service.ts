// The fuel log (D-148): confirmed owners log fill-ups; between two full tanks SAZO works out how far the car went on a
// litre (the litres put in after the first full tank, up to and including the second). Buyers see only the owners'
// average, once there are at least 3 measured tanks, and never who logged them.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';

export const MIN_MEASURED_TANKS = 3;

export interface Fillup { id: string; filledOn: string; litres: number; odometerKm: number; fullTank: boolean; kmPerL: number | null }
interface Row { id: string; userId: string; filledOn: string; litres: number; odometerKm: number; fullTank: boolean }

/** Each fill-up's km per litre (only on the second of two full tanks), and the totals, for one person's fill-ups. */
export function measure(rows: Omit<Row, 'userId'>[]): { items: Fillup[]; km: number; litres: number; tanks: number } {
  const sorted = [...rows].sort((a, b) => a.odometerKm - b.odometerKm || a.filledOn.localeCompare(b.filledOn));
  let lastFull: Omit<Row, 'userId'> | undefined;
  let since = 0, km = 0, litres = 0, tanks = 0;
  const out = new Map<string, number | null>();
  for (const r of sorted) {
    if (lastFull) since += r.litres;
    let value: number | null = null;
    if (r.fullTank) {
      if (lastFull && r.odometerKm > lastFull.odometerKm && since > 0) {
        const d = r.odometerKm - lastFull.odometerKm;
        value = Math.round((d / since) * 10) / 10;
        km += d; litres += since; tanks += 1;
      }
      lastFull = r; since = 0;
    }
    out.set(r.id, value);
  }
  const items = [...rows].sort((a, b) => b.filledOn.localeCompare(a.filledOn) || b.odometerKm - a.odometerKm)
    .map((r) => ({ ...r, kmPerL: out.get(r.id) ?? null }));
  return { items, km, litres, tanks };
}

export class FuelError extends Error {
  constructor(readonly code: 'mileage_lower' | 'date_in_future', message: string) { super(message); }
}

@Injectable()
export class FuelService {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  private async rows(vehicleIds: string[], userId?: string): Promise<Row[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT id, user_id AS "userId", to_char(filled_on, 'YYYY-MM-DD') AS "filledOn", litres::float8 AS litres, odometer_km AS "odometerKm", full_tank AS "fullTank"
         FROM report.fuel_fillups WHERE vehicle_id = ANY($1::uuid[]) AND removed_at IS NULL AND ($2::uuid IS NULL OR user_id = $2)`,
      [vehicleIds, userId ?? null]);
    return rows;
  }

  /** One owner's log for a car, newest first, with their own average. */
  async log(userId: string, vehicleIds: string[]) {
    const m = measure(await this.rows(vehicleIds, userId));
    return { items: m.items, average: m.tanks ? Math.round((m.km / m.litres) * 10) / 10 : null, measuredTanks: m.tanks };
  }

  async add(userId: string, vehicleId: string, f: { filledOn: string; litres: number; odometerKm: number; fullTank: boolean }): Promise<string> {
    const { rows } = await this.pool.query<{ km: number | null }>(
      `SELECT max(odometer_km) AS km FROM report.fuel_fillups WHERE user_id = $1 AND vehicle_id = $2 AND removed_at IS NULL AND filled_on <= $3`,
      [userId, vehicleId, f.filledOn]);
    if (rows[0]?.km != null && f.odometerKm < rows[0].km) throw new FuelError('mileage_lower', `The mileage is lower than your last fill-up (${rows[0].km.toLocaleString('en-GB')} km)`);
    const ins = await this.pool.query<{ id: string }>(
      `INSERT INTO report.fuel_fillups (vehicle_id, user_id, filled_on, litres, odometer_km, full_tank) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [vehicleId, userId, f.filledOn, f.litres, f.odometerKm, f.fullTank]);
    return ins.rows[0]!.id;
  }

  /** Take back a fill-up typed by mistake (kept, marked removed). */
  async remove(userId: string, vehicleIds: string[], id: string): Promise<boolean> {
    const r = await this.pool.query(`UPDATE report.fuel_fillups SET removed_at = now() WHERE id = $1 AND user_id = $2 AND vehicle_id = ANY($3::uuid[]) AND removed_at IS NULL`, [id, userId, vehicleIds]);
    return r.rowCount === 1;
  }

  /** The owners' average for a car: each owner's measured tanks added together. Undefined below 3 measured tanks. */
  async ownersAverage(vehicleIds: string[]): Promise<{ kmPerL: number; tanks: number } | undefined> {
    const byUser = new Map<string, Row[]>();
    for (const r of await this.rows(vehicleIds)) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    let km = 0, litres = 0, tanks = 0;
    for (const rows of byUser.values()) { const m = measure(rows); km += m.km; litres += m.litres; tanks += m.tanks; }
    return tanks >= MIN_MEASURED_TANKS && litres > 0 ? { kmPerL: Math.round((km / litres) * 10) / 10, tanks } : undefined;
  }
}
