// Observations & Evidence — module 4 (Domain Model §4). Owns the `obs` schema.
// Observations, events, evidence links, relations and attestations are append-only (DB triggers, DM-11).
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { OBSERVATION_TYPES, requiredEvidenceFor, type EvidenceClass, type EvidenceKind, type ObservationTypeCode } from '@sazo/contracts';
import pg from 'pg';
import { z } from 'zod';
import type { Emit } from '../../platform/event-bus.js';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export interface RecordInput {
  type: string;
  attributes: Record<string, unknown>;
  time: { at: string | null; precision: 'exact' | 'day' | 'month' | 'year' | 'unknown' };
  evidenceIds?: string[];
}

export interface StoredObservation {
  id: string;
  vehicleId: string;
  eventId: string | null;
  type: string;
  attributes: Record<string, unknown>;
  eventTime: string | null;
  precision: 'exact' | 'day' | 'month' | 'year' | 'unknown';
  recordedAt: string;
  sourceId: string;
  evidenceClass: EvidenceClass;
  sensitivity: 'public' | 'restricted' | 'confidential';
  evidenceKinds: EvidenceKind[];
}

const EVENT_TYPE: Record<string, string> = {
  garage: 'garage_job', inspection: 'inspection', customs: 'import', registration: 'registration', police: 'police_report',
  finance: 'finance_change', insurance: 'insurance_event', auction: 'auction_sale', rental: 'rental_period', owner: 'owner_submission',
};

function jsonSchemaOf(schema: z.ZodType): unknown {
  try {
    return z.toJSONSchema(schema, { unrepresentable: 'any' });
  } catch {
    return {}; // refinements that JSON Schema can't express: the Zod schema in code stays the authority
  }
}

function requiredEvidenceOf(code: ObservationTypeCode): string[] {
  try {
    return requiredEvidenceFor(code, {});
  } catch {
    return [];
  }
}

@Injectable()
export class ObservationsService implements OnModuleInit {
  private readonly log = new Logger('Observations');
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  /** Keep obs.observation_types in step with the code catalogue (@sazo/contracts). */
  async onModuleInit(): Promise<void> {
    for (const [code, def] of Object.entries(OBSERVATION_TYPES)) {
      const schema = jsonSchemaOf(def.schema as z.ZodType);
      const required = requiredEvidenceOf(code as ObservationTypeCode);
      await this.pool.query(
        `INSERT INTO obs.observation_types (code, schema_version, domain, json_schema, default_sensitivity, required_evidence)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code, schema_version) DO UPDATE SET json_schema = EXCLUDED.json_schema,
           default_sensitivity = EXCLUDED.default_sensitivity, required_evidence = EXCLUDED.required_evidence`,
        [code, def.schemaVersion, def.domain, schema, def.defaultSensitivity, required],
      );
    }
    this.log.log(`observation catalogue synced (${Object.keys(OBSERVATION_TYPES).length} types)`);
  }

  /**
   * Store one submission item's records for a vehicle. Records on the same day become one event
   * (e.g. one garage visit). Emits observation.recorded after the transaction commits.
   */
  async recordItem(tx: Sql, emit: Emit, input: {
    vehicleId: string; sourceId: string; sourceDomain: string; evidenceClass: EvidenceClass; submissionId: string; submissionItemId: string;
    records: RecordInput[]; enteredByUserId?: string | null; actingForOrganisationId?: string | null;
  }): Promise<string[]> {
    const events = new Map<string, string>();
    const ids: string[] = [];
    for (const r of input.records) {
      const day = r.time.at ? r.time.at.slice(0, 10) : 'unknown';
      let eventId = events.get(day);
      if (!eventId) {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO obs.vehicle_events (vehicle_id, type, event_time, event_time_precision, source_id, submission_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [input.vehicleId, EVENT_TYPE[input.sourceDomain] ?? 'other', r.time.at, r.time.at ? r.time.precision : 'unknown', input.sourceId, input.submissionId],
        );
        eventId = rows[0]!.id;
        events.set(day, eventId);
      }
      const def = OBSERVATION_TYPES[r.type as ObservationTypeCode];
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO obs.observations (vehicle_id, event_id, type, type_schema_version, attributes, event_time, event_time_precision,
           source_id, submission_item_id, entered_by_user_id, acting_for_organisation_id, evidence_class, sensitivity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [input.vehicleId, eventId, r.type, def.schemaVersion, r.attributes, r.time.at, r.time.at ? r.time.precision : 'unknown',
          input.sourceId, input.submissionItemId, input.enteredByUserId ?? null, input.actingForOrganisationId ?? null,
          input.evidenceClass, def.defaultSensitivity],
      );
      const obsId = rows[0]!.id;
      ids.push(obsId);
      for (const [i, evId] of (r.evidenceIds ?? []).entries()) {
        await tx.query(
          'INSERT INTO obs.observation_evidence (observation_id, evidence_file_id, role) VALUES ($1, $2, $3)',
          [obsId, evId, i === 0 ? 'primary' : 'supporting'],
        );
      }
    }
    await emit('obs', { type: 'observation.recorded', aggregateId: input.vehicleId, payload: { vehicleId: input.vehicleId, observationIds: ids } });
    return ids;
  }

  /** Register an uploaded evidence file (write-once storage; hash recorded). */
  async registerEvidence(e: { id?: string; storageKey: string; sha256: string; mimeType: string; sizeBytes: number; kind: EvidenceKind; capturedAt?: string | null; uploadedByUserId?: string | null }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO obs.evidence_files (id, storage_key, sha256, mime_type, size_bytes, kind, captured_at, uploaded_by_user_id)
       VALUES (COALESCE($8::uuid, gen_random_uuid()), $1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [e.storageKey, e.sha256, e.mimeType, e.sizeBytes, e.kind, e.capturedAt ?? null, e.uploadedByUserId ?? null, e.id ?? null],
    );
    return rows[0]!.id;
  }

  async evidenceKinds(ids: string[], sql: Sql = this.pool): Promise<Map<string, EvidenceKind>> {
    if (!ids.length) return new Map();
    const { rows } = await sql.query<{ id: string; kind: EvidenceKind }>('SELECT id, kind FROM obs.evidence_files WHERE id = ANY($1)', [ids]);
    return new Map(rows.map((r) => [r.id, r.kind]));
  }

  async listForVehicles(vehicleIds: string[]): Promise<StoredObservation[]> {
    const { rows } = await this.pool.query<StoredObservation & { eventTime: Date | null; recordedAt: Date }>(
      `SELECT o.id, o.vehicle_id AS "vehicleId", o.event_id AS "eventId", o.type, o.attributes, o.event_time AS "eventTime",
              o.event_time_precision AS precision, o.recorded_at AS "recordedAt", o.source_id AS "sourceId",
              o.evidence_class AS "evidenceClass", o.sensitivity,
              COALESCE(array_agg(f.kind) FILTER (WHERE f.kind IS NOT NULL), '{}') AS "evidenceKinds"
         FROM obs.observations o
         LEFT JOIN obs.observation_evidence oe ON oe.observation_id = o.id
         LEFT JOIN obs.evidence_files f ON f.id = oe.evidence_file_id
        WHERE o.vehicle_id = ANY($1)
        GROUP BY o.id
        ORDER BY o.event_time NULLS LAST, o.recorded_at`,
      [vehicleIds],
    );
    return rows.map((r) => ({
      ...r,
      eventTime: r.eventTime ? new Date(r.eventTime).toISOString() : null,
      recordedAt: new Date(r.recordedAt).toISOString(),
    }));
  }

  /** Vehicles holding at least one record from a source (to re-weigh them when the source changes, X1). */
  async vehiclesWithSource(sourceId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ vehicle_id: string }>('SELECT DISTINCT vehicle_id FROM obs.observations WHERE source_id = $1', [sourceId]);
    return rows.map((r) => r.vehicle_id);
  }

  async relationsFor(vehicleIds: string[]): Promise<{ from: string; to: string; kind: 'corrects' | 'retracts' | 'duplicates' | 'corroborates' }[]> {
    const { rows } = await this.pool.query(
      `SELECT r.from_observation_id AS "from", r.to_observation_id AS "to", r.kind
         FROM obs.observation_relations r JOIN obs.observations o ON o.id = r.to_observation_id
        WHERE o.vehicle_id = ANY($1)`,
      [vehicleIds],
    );
    return rows;
  }

  async attestationsFor(vehicleIds: string[]): Promise<{ eventId?: string; observationId?: string; attesterKind: 'registered_owner' | 'customer' | 'inspector' | 'organisation'; response: 'confirmed' | 'disputed' | 'no_response' }[]> {
    const { rows } = await this.pool.query(
      `SELECT a.target_event_id AS "eventId", a.target_observation_id AS "observationId", a.attester_kind AS "attesterKind", a.response
         FROM obs.attestations a
         LEFT JOIN obs.vehicle_events e ON e.id = a.target_event_id
         LEFT JOIN obs.observations o ON o.id = a.target_observation_id
        WHERE COALESCE(e.vehicle_id, o.vehicle_id) = ANY($1)`,
      [vehicleIds],
    );
    return rows.map((r) => ({ ...r, eventId: r.eventId ?? undefined, observationId: r.observationId ?? undefined }));
  }

  /** Confirmations/disputes per source, used for garage reputation (Rule Set §2). */
  async attestationStatsBySource(): Promise<Map<string, { confirmed: number; disputed: number }>> {
    const { rows } = await this.pool.query<{ sourceId: string; confirmed: number; disputed: number }>(
      `SELECT e.source_id AS "sourceId",
              count(*) FILTER (WHERE a.response = 'confirmed')::int AS confirmed,
              count(*) FILTER (WHERE a.response = 'disputed')::int AS disputed
         FROM obs.attestations a JOIN obs.vehicle_events e ON e.id = a.target_event_id
        WHERE a.attester_kind IN ('registered_owner','customer')
        GROUP BY e.source_id`,
    );
    return new Map(rows.map((r) => [r.sourceId, { confirmed: r.confirmed, disputed: r.disputed }]));
  }

  async addRelation(emit: Emit, tx: Sql, rel: { from: string; to: string; kind: 'corrects' | 'retracts' | 'duplicates' | 'corroborates'; reason?: string; byUserId?: string | null }): Promise<void> {
    const { rows } = await tx.query<{ vehicle_id: string }>('SELECT vehicle_id FROM obs.observations WHERE id = $1', [rel.to]);
    if (!rows[0]) throw new Error('observation not found');
    await tx.query(
      'INSERT INTO obs.observation_relations (from_observation_id, to_observation_id, kind, reason, created_by_user_id) VALUES ($1,$2,$3,$4,$5)',
      [rel.from, rel.to, rel.kind, rel.reason ?? null, rel.byUserId ?? null],
    );
    await emit('obs', { type: 'observation.related', aggregateId: rows[0].vehicle_id, payload: { vehicleId: rows[0].vehicle_id, ...rel } });
  }

  async recordAttestation(emit: Emit, tx: Sql, a: { eventId: string; attesterKind: 'registered_owner' | 'customer' | 'inspector' | 'organisation'; response: 'confirmed' | 'disputed'; channel: 'sms_reply' | 'sms_link' | 'app'; partyId?: string | null; comment?: string | null }): Promise<void> {
    const { rows } = await tx.query<{ vehicle_id: string; source_id: string }>('SELECT vehicle_id, source_id FROM obs.vehicle_events WHERE id = $1', [a.eventId]);
    if (!rows[0]) throw new Error('event not found');
    await tx.query(
      `INSERT INTO obs.attestations (target_event_id, attester_kind, attester_party_id, channel, response, comment) VALUES ($1,$2,$3,$4,$5,$6)`,
      [a.eventId, a.attesterKind, a.partyId ?? null, a.channel, a.response, a.comment ?? null],
    );
    await emit('obs', { type: 'attestation.received', aggregateId: rows[0].vehicle_id, payload: { vehicleId: rows[0].vehicle_id, sourceId: rows[0].source_id, response: a.response } });
  }

  async findEvent(vehicleId: string, sourceId: string, day: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM obs.vehicle_events WHERE vehicle_id = $1 AND source_id = $2 AND event_time::date = $3::date ORDER BY created_at LIMIT 1`,
      [vehicleId, sourceId, day],
    );
    return rows[0]?.id;
  }

  async events(vehicleIds: string[]): Promise<{ id: string; type: string; eventTime: string | null; precision: string; sourceId: string; ownerConfirmation: string }[]> {
    const { rows } = await this.pool.query(
      `SELECT e.id, e.type, e.event_time AS "eventTime", e.event_time_precision AS precision, e.source_id AS "sourceId",
              COALESCE((SELECT a.response FROM obs.attestations a WHERE a.target_event_id = e.id ORDER BY a.responded_at DESC LIMIT 1),
                       'not_requested') AS "ownerConfirmation"
         FROM obs.vehicle_events e WHERE e.vehicle_id = ANY($1) ORDER BY e.event_time NULLS LAST, e.created_at`,
      [vehicleIds],
    );
    return rows.map((r) => ({ ...r, eventTime: r.eventTime ? new Date(r.eventTime).toISOString() : null }));
  }
}
