// Data access for the Vehicle Registry. Reads/writes only the `vehicle` schema (D-081).
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { DB_POOL } from '../../platform/database.module.js';

export interface IdentifierMatch {
  vehicleId: string;
  publicRef: string;
  vehicleStatus: 'active' | 'provisional' | 'merged' | 'retired';
  identifierType: string;
  identifierStatus: 'active' | 'historical' | 'disputed';
  value: string;
}

@Injectable()
export class VehicleRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  /** Exact identifier lookup. Merged vehicles are followed to their survivor (DM-7). */
  async findByIdentifier(types: string[], normalized: string): Promise<IdentifierMatch[]> {
    const { rows } = await this.pool.query<IdentifierMatch>(
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

  async currentPlate(vehicleId: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ value_raw: string }>(
      `SELECT value_raw FROM vehicle.vehicle_identifiers
        WHERE vehicle_id = $1 AND type = 'registration_plate' AND status IN ('active','disputed')
        ORDER BY valid_from DESC NULLS LAST, created_at DESC LIMIT 1`,
      [vehicleId],
    );
    return rows[0]?.value_raw;
  }
}
