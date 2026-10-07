// Data access for the Vehicle Registry. Reads/writes only the `vehicle` schema (D-081).
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { publicRef, type Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export type IdentifierType = 'vin' | 'chassis_number' | 'registration_plate' | 'engine_number' | 'import_reference';
export type VehicleStatus = 'active' | 'provisional' | 'merged' | 'retired';

export interface IdentifierMatch {
  vehicleId: string;
  publicRef: string;
  vehicleStatus: VehicleStatus;
  identifierType: string;
  identifierStatus: 'active' | 'historical' | 'disputed';
  value: string;
}

export interface IdentifierRow {
  id: string;
  vehicleId: string;
  type: IdentifierType;
  valueRaw: string;
  value: string;
  status: 'active' | 'historical' | 'disputed';
  sourceObservationId: string | null;
}

export interface NewIdentifier {
  vehicleId: string;
  type: IdentifierType;
  raw: string;
  normalized: string;
  status?: 'active' | 'historical' | 'disputed';
  validFrom?: string | null;
  changeReason?: string | null;
  sourceObservationId?: string | null;
}

const IDENT_COLS = `id, vehicle_id AS "vehicleId", type, value_raw AS "valueRaw", value_normalized AS value, status,
  source_observation_id AS "sourceObservationId"`;

@Injectable()
export class VehicleRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  /** Exact identifier lookup. Merged vehicles are followed to their survivor (DM-7). */
  async findByIdentifier(types: string[], normalized: string, sql: Sql = this.pool): Promise<IdentifierMatch[]> {
    const { rows } = await sql.query<IdentifierMatch>(
      `WITH RECURSIVE hits AS (
         SELECT v.id, v.public_ref, v.status, v.merged_into_id, i.type, i.status AS istatus, i.value_normalized, 0 AS depth
           FROM vehicle.vehicle_identifiers i JOIN vehicle.vehicles v ON v.id = i.vehicle_id
          WHERE i.type = ANY($1) AND i.value_normalized = $2
         UNION ALL
         SELECT v.id, v.public_ref, v.status, v.merged_into_id, h.type, h.istatus, h.value_normalized, h.depth + 1
           FROM hits h JOIN vehicle.vehicles v ON v.id = h.merged_into_id
          WHERE h.depth < 10
       )
       SELECT DISTINCT ON (id) id AS "vehicleId", public_ref AS "publicRef", status AS "vehicleStatus",
              type AS "identifierType", istatus AS "identifierStatus", value_normalized AS value
         FROM hits WHERE status <> 'merged'
        ORDER BY id, (istatus = 'active') DESC`,
      [types, normalized],
    );
    return rows;
  }

  async currentPlate(vehicleId: string, sql: Sql = this.pool): Promise<string | undefined> {
    const { rows } = await sql.query<{ value_raw: string }>(
      `SELECT value_raw FROM vehicle.vehicle_identifiers
        WHERE vehicle_id = $1 AND type = 'registration_plate' AND status IN ('active','disputed')
        ORDER BY (status = 'active') DESC, valid_from DESC NULLS LAST, created_at DESC LIMIT 1`,
      [vehicleId],
    );
    return rows[0]?.value_raw;
  }

  async identifiers(vehicleId: string, sql: Sql = this.pool): Promise<IdentifierRow[]> {
    const { rows } = await sql.query<IdentifierRow>(
      `SELECT ${IDENT_COLS} FROM vehicle.vehicle_identifiers WHERE vehicle_id = $1 ORDER BY created_at`, [vehicleId]);
    return rows;
  }

  /** Vehicles currently holding a plate (active or disputed), with whether they have a VIN/chassis anchor. */
  async plateHolders(normalized: string, sql: Sql = this.pool): Promise<(IdentifierRow & { vehicleStatus: VehicleStatus; hasAnchor: boolean })[]> {
    const { rows } = await sql.query(
      `SELECT i.id, i.vehicle_id AS "vehicleId", i.type, i.value_raw AS "valueRaw", i.value_normalized AS value, i.status,
              i.source_observation_id AS "sourceObservationId", v.status AS "vehicleStatus",
              EXISTS (SELECT 1 FROM vehicle.vehicle_identifiers a WHERE a.vehicle_id = v.id
                        AND a.type IN ('vin','chassis_number') AND a.status = 'active') AS "hasAnchor"
         FROM vehicle.vehicle_identifiers i JOIN vehicle.vehicles v ON v.id = i.vehicle_id
        WHERE i.type = 'registration_plate' AND i.value_normalized = $1 AND i.status IN ('active','disputed')
          AND v.status <> 'merged'`,
      [normalized],
    );
    return rows;
  }

  async createVehicle(sql: Sql, status: 'active' | 'provisional', submissionId: string | null): Promise<{ id: string; publicRef: string }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = publicRef('SZV');
      const { rows } = await sql.query<{ id: string }>(
        `INSERT INTO vehicle.vehicles (public_ref, status, created_by_submission_id) VALUES ($1, $2, $3)
         ON CONFLICT (public_ref) DO NOTHING RETURNING id`,
        [ref, status, submissionId],
      );
      if (rows[0]) return { id: rows[0].id, publicRef: ref };
    }
    throw new Error('could not allocate a unique vehicle reference');
  }

  async setVehicleStatus(sql: Sql, vehicleId: string, status: VehicleStatus, mergedIntoId: string | null = null): Promise<void> {
    await sql.query('UPDATE vehicle.vehicles SET status = $2, merged_into_id = $3 WHERE id = $1', [vehicleId, status, mergedIntoId]);
  }

  async addIdentifier(sql: Sql, n: NewIdentifier): Promise<string> {
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO vehicle.vehicle_identifiers
         (vehicle_id, type, value_raw, value_normalized, status, valid_from, time_precision, change_reason, source_observation_id)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::timestamptz IS NULL THEN 'unknown' ELSE 'day' END, $7, $8) RETURNING id`,
      [n.vehicleId, n.type, n.raw, n.normalized, n.status ?? 'active', n.validFrom ?? null, n.changeReason ?? null, n.sourceObservationId ?? null],
    );
    return rows[0]!.id;
  }

  async setIdentifierStatus(sql: Sql, id: string, status: 'active' | 'historical' | 'disputed', validTo?: string | null, changeReason?: string): Promise<void> {
    await sql.query(
      `UPDATE vehicle.vehicle_identifiers SET status = $2, valid_to = COALESCE($3, valid_to), change_reason = COALESCE($4, change_reason) WHERE id = $1`,
      [id, status, validTo ?? null, changeReason ?? null],
    );
  }

  async linkProvenance(sql: Sql, identifierIds: string[], observationId: string): Promise<void> {
    if (!identifierIds.length) return;
    await sql.query(
      'UPDATE vehicle.vehicle_identifiers SET source_observation_id = $2 WHERE id = ANY($1) AND source_observation_id IS NULL',
      [identifierIds, observationId],
    );
  }

  async insertDecision(sql: Sql, d: {
    submissionItemId: string; presented: object; outcome: string; matchedVehicleId?: string | null;
    candidates?: string[]; rule: string; score?: number | null; decidedBy?: string | null;
  }): Promise<string> {
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO vehicle.resolution_decisions
         (submission_item_id, presented_identifiers, outcome, matched_vehicle_id, candidate_vehicle_ids, rule_applied, score, decided_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [d.submissionItemId, d.presented, d.outcome, d.matchedVehicleId ?? null, d.candidates ?? [], d.rule, d.score ?? null, d.decidedBy ?? null],
    );
    return rows[0]!.id;
  }

  async getDecision(id: string, sql: Sql = this.pool) {
    const { rows } = await sql.query<{
      id: string; submissionItemId: string; presented: Record<string, string>; outcome: string; candidates: string[];
    }>(
      `SELECT id, submission_item_id AS "submissionItemId", presented_identifiers AS presented, outcome,
              candidate_vehicle_ids AS candidates FROM vehicle.resolution_decisions WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  async latestDecisionForItem(submissionItemId: string): Promise<{ id: string; outcome: string; matchedVehicleId: string | null; candidates: string[]; presented: unknown } | undefined> {
    const { rows } = await this.pool.query(
      `SELECT id, outcome, matched_vehicle_id AS "matchedVehicleId", candidate_vehicle_ids AS candidates, presented_identifiers AS presented
         FROM vehicle.resolution_decisions WHERE submission_item_id = $1 ORDER BY decided_at DESC, id DESC LIMIT 1`,
      [submissionItemId],
    );
    return rows[0];
  }

  async getVehicle(id: string, sql: Sql = this.pool): Promise<{ id: string; publicRef: string; status: VehicleStatus; mergedIntoId: string | null } | undefined> {
    const { rows } = await sql.query(
      `SELECT id, public_ref AS "publicRef", status, merged_into_id AS "mergedIntoId" FROM vehicle.vehicles WHERE id = $1`, [id]);
    return rows[0];
  }

  /** Resolve a public reference to the surviving vehicle id. */
  async idForRef(ref: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ id: string }>(
      `WITH RECURSIVE chain AS (
         SELECT id, merged_into_id, 0 AS depth FROM vehicle.vehicles WHERE public_ref = $1
         UNION ALL SELECT v.id, v.merged_into_id, c.depth + 1 FROM chain c JOIN vehicle.vehicles v ON v.id = c.merged_into_id WHERE c.depth < 10)
       SELECT id FROM chain WHERE merged_into_id IS NULL LIMIT 1`,
      [ref],
    );
    return rows[0]?.id;
  }

  /** The vehicle plus every vehicle merged into it (their observations belong to it, DM-7). */
  async mergeFamily(vehicleId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `WITH RECURSIVE fam AS (
         SELECT id, 0 AS depth FROM vehicle.vehicles WHERE id = $1
         UNION ALL SELECT v.id, f.depth + 1 FROM fam f JOIN vehicle.vehicles v ON v.merged_into_id = f.id WHERE f.depth < 10)
       SELECT id FROM fam`,
      [vehicleId],
    );
    return rows.map((r) => r.id);
  }

  async insertMerge(sql: Sql, fromId: string, intoId: string, reason: string, by: string): Promise<string> {
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO vehicle.vehicle_merges (from_vehicle_id, into_vehicle_id, reason, decided_by_user_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [fromId, intoId, reason, by],
    );
    return rows[0]!.id;
  }
}
