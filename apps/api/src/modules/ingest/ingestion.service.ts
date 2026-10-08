// Ingestion — module 3: the only way data enters SAZO (D-010).
// Submission (stored exactly as received) → validate → required evidence → resolve vehicle → observations.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DOMAIN_RECORD_TYPES, isObservationType, requiredEvidenceFor, validateObservation } from '@sazo/contracts';
import pg from 'pg';
import { EventBus } from '../../platform/event-bus.js';
import { DB_POOL } from '../../platform/tokens.js';
import { ObservationsService, type RecordInput } from '../obs/index.js';
import { VehicleRegistry, type PresentedIdentifiers, type Resolution } from '../vehicle/index.js';
import { SourcesRepository, type SourceRow } from './sources.repository.js';

export interface SubmissionItemInput {
  identifiers: PresentedIdentifiers;
  records: RecordInput[];
}

export interface SubmissionInput {
  schemaVersion: number;
  items: SubmissionItemInput[];
}

export interface ItemResult {
  sequence: number;
  status: 'pending' | 'accepted' | 'rejected' | 'needs_review';
  /** Internal id — stripped from HTTP responses (vehicles are addressed by public reference). */
  vehicleId?: string;
  vehicleRef?: string;
  resolution?: Resolution['outcome'];
  decisionId?: string;
  observationIds?: string[];
  errors: { path: string; code: string; message: string }[];
}

export interface SubmissionResult {
  submissionId: string;
  sourceCode: string;
  status: 'received' | 'accepted' | 'partially_accepted' | 'rejected' | 'processed';
  replayed: boolean;
  items: ItemResult[];
}

export class IngestionError extends Error {
  constructor(readonly code: 'unknown_source' | 'source_not_active' | 'idempotency_key_reused' | 'organisation_not_approved', message: string) {
    super(message);
  }
}

/** Channels where evidence rules (D-057) are enforced at intake. */
const CAPTURE_CHANNELS = new Set(['garage_app', 'inspector_app']);

@Injectable()
export class IngestionService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(SourcesRepository) private readonly sources: SourcesRepository,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
  ) {}

  listSources(): Promise<SourceRow[]> {
    return this.sources.list();
  }

  sourceByCode(code: string): Promise<SourceRow | undefined> {
    return this.sources.byCode(code);
  }

  sourceById(id: string): Promise<SourceRow | undefined> {
    return this.sources.byId(id);
  }

  /** Change a source's status; emits ingest.source_changed so Trust re-weighs that source's records (X1). */
  async updateSource(id: string, change: { status?: SourceRow['status']; supersededBySourceId?: string | null }): Promise<SourceRow> {
    await this.bus.transaction(async (tx, emit) => {
      await this.sources.updateStatus(tx, id, change);
      await emit('ingest', { type: 'ingest.source_changed', aggregateId: id, payload: { sourceId: id, ...change } });
    });
    return (await this.sources.byId(id))!;
  }

  /** How many submissions a person made to a source recently (simple abuse limit for owner submissions). */
  async countRecentByUser(sourceId: string, userId: string, hours: number): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ingest.submissions WHERE source_id = $1 AND submitted_by_user_id = $2 AND received_at > now() - make_interval(hours => $3)`,
      [sourceId, userId, hours]);
    return rows[0]!.n;
  }

  /** Recent submissions for a source, newest first, with how their items fared. */
  async recentSubmissions(sourceId: string, limit: number) {
    const { rows } = await this.pool.query(
      `SELECT s.id AS "submissionId", s.status, s.received_at AS "receivedAt",
              count(i.id)::int AS items,
              count(i.id) FILTER (WHERE i.status = 'accepted')::int AS accepted,
              count(i.id) FILTER (WHERE i.status = 'rejected')::int AS rejected,
              count(i.id) FILTER (WHERE i.status = 'needs_review')::int AS "needsReview"
         FROM ingest.submissions s LEFT JOIN ingest.submission_items i ON i.submission_id = s.id
        WHERE s.source_id = $1 GROUP BY s.id ORDER BY s.received_at DESC LIMIT $2`, [sourceId, limit]);
    return rows.map((r) => ({ ...r, receivedAt: new Date(r.receivedAt).toISOString() }));
  }

  /** The organisation a submission was made for (its source's owner) — used for access checks. */
  async submissionOrganisation(submissionId: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ organisation_id: string }>(
      'SELECT src.organisation_id FROM ingest.submissions s JOIN ingest.sources src ON src.id = s.source_id WHERE s.id = $1', [submissionId]);
    return rows[0]?.organisation_id;
  }

  upsertSource(...args: Parameters<SourcesRepository['upsert']>): Promise<string> {
    return this.sources.upsert(...args);
  }

  /**
   * Accept a submission. Idempotent per (source, key): a replay returns the original result,
   * a different body under the same key is refused (X5).
   * `legacyImport` (internal use only — never exposed over HTTP) loads historical records
   * captured before the evidence rule existed, e.g. scenario S03.
   */
  async submit(sourceCode: string, input: SubmissionInput, opts: { idempotencyKey: string; userId?: string | null; organisationId?: string | null; legacyImport?: boolean }): Promise<SubmissionResult> {
    const source = await this.sources.byCode(sourceCode);
    if (!source) throw new IngestionError('unknown_source', `unknown source ${sourceCode}`);
    if (source.status !== 'active') throw new IngestionError('source_not_active', `source ${sourceCode} is ${source.status}`);

    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await this.pool.query<{ id: string; payload_sha256: string }>(
      'SELECT id, payload_sha256 FROM ingest.submissions WHERE source_id = $1 AND idempotency_key = $2', [source.id, opts.idempotencyKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].payload_sha256 !== payloadHash) {
        throw new IngestionError('idempotency_key_reused', 'this Idempotency-Key was already used with a different body');
      }
      return { ...(await this.get(existing.rows[0].id))!, replayed: true };
    }

    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO ingest.submissions (source_id, submitted_by_user_id, acting_for_organisation_id, idempotency_key, raw_payload, payload_sha256, schema_version, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'validating') RETURNING id`,
      [source.id, opts.userId ?? null, opts.organisationId ?? null, opts.idempotencyKey, input, payloadHash, input.schemaVersion],
    );
    const submissionId = rows[0]!.id;
    for (const [i, item] of input.items.entries()) {
      await this.pool.query('INSERT INTO ingest.submission_items (submission_id, sequence, raw_item) VALUES ($1,$2,$3)', [submissionId, i + 1, item]);
    }

    const created = new Map<number, string[]>();
    for (const [i, item] of input.items.entries()) {
      created.set(i + 1, await this.processItem(source, submissionId, i + 1, item, opts));
    }
    await this.finalise(submissionId);
    const result = (await this.get(submissionId))!;
    return { ...result, replayed: false, items: result.items.map((it) => ({ ...it, observationIds: created.get(it.sequence) ?? [] })) };
  }

  private async itemId(submissionId: string, sequence: number): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>('SELECT id FROM ingest.submission_items WHERE submission_id = $1 AND sequence = $2', [submissionId, sequence]);
    return rows[0]!.id;
  }

  private async processItem(source: SourceRow, submissionId: string, sequence: number, item: SubmissionItemInput,
    opts: { userId?: string | null; organisationId?: string | null; legacyImport?: boolean }, forced?: Resolution): Promise<string[]> {
    const itemId = await this.itemId(submissionId, sequence);
    const errors: ItemResult['errors'] = [];

    // 1. Validate every record against the catalogue.
    const records: RecordInput[] = [];
    // People sending records (not internal loads) may only send their source's kinds of record (e.g. no mileage from police).
    const allowed = opts.userId && source.channel !== 'garage_app' ? DOMAIN_RECORD_TYPES[source.domain] : undefined;
    for (const [ri, r] of (item.records ?? []).entries()) {
      if (allowed && !allowed.includes(r.type as never)) {
        errors.push({ path: `records[${ri}].type`, code: 'record_type_not_allowed', message: `a ${source.domain} source cannot send ${r.type}` });
        continue;
      }
      const v = validateObservation(r.type, r.attributes);
      if (!v.ok) {
        for (const e of v.errors) errors.push({ path: `records[${ri}].${e.path}`, code: 'invalid_record', message: e.message });
        continue;
      }
      records.push({ ...r, attributes: v.attributes });
    }
    if (!records.length && !errors.length) errors.push({ path: 'records', code: 'no_records', message: 'item has no records' });

    // 2. Required evidence on capture channels (D-057).
    if (!errors.length && CAPTURE_CHANNELS.has(source.channel) && !opts.legacyImport) {
      const kinds = await this.observations.evidenceKinds(records.flatMap((r) => r.evidenceIds ?? []));
      for (const [ri, r] of records.entries()) {
        if (!isObservationType(r.type)) continue;
        const attached = new Set((r.evidenceIds ?? []).map((id) => kinds.get(id)));
        for (const need of requiredEvidenceFor(r.type, r.attributes)) {
          if (!attached.has(need)) errors.push({ path: `records[${ri}].evidenceIds`, code: 'evidence_required', message: `${r.type} needs a ${need}` });
        }
      }
    }

    if (errors.length) {
      await this.pool.query(`UPDATE ingest.submission_items SET status = 'rejected', errors = $2 WHERE id = $1`, [itemId, JSON.stringify(errors)]);
      return [];
    }

    // 3. Resolve the vehicle and store observations atomically; events are delivered after commit.
    const firstTime = records.map((r) => r.time.at).filter(Boolean).sort()[0] ?? null;
    return this.bus.transaction(async (tx, emit): Promise<string[]> => {
      const resolution = forced ?? (await this.registry.resolve(tx, item.identifiers, {
        submissionItemId: itemId, submissionId, eventTime: firstTime,
        newVehicleStatus: source.evidenceClass === 'owner_provided' || source.evidenceClass === 'community' ? 'provisional' : 'active',
      }));
      if (resolution.outcome === 'rejected' || resolution.outcome === 'ambiguous') {
        const status = resolution.outcome === 'ambiguous' ? 'needs_review' : 'rejected';
        const errs = resolution.outcome === 'rejected' ? [{ path: 'identifiers', code: resolution.reason ?? 'unresolvable', message: 'could not identify the vehicle' }] : [];
        await tx.query(`UPDATE ingest.submission_items SET status = $2, resolution_decision_id = $3, errors = $4 WHERE id = $1`,
          [itemId, status, resolution.decisionId, JSON.stringify(errs)]);
        return [];
      }
      const vehicleId = resolution.vehicleId!;
      if (source.evidenceClass === 'official') await this.registry.confirmIfProvisional(tx, vehicleId);
      const observationIds = await this.observations.recordItem(tx, emit, {
        vehicleId, sourceId: source.id, sourceDomain: source.domain, evidenceClass: source.evidenceClass, submissionId,
        submissionItemId: itemId, records, enteredByUserId: opts.userId, actingForOrganisationId: opts.organisationId,
      });
      await this.registry.linkProvenance(tx, resolution.newIdentifierIds, observationIds[0]!);
      await this.registry.applyIdentifierRecords(tx, vehicleId, records.map((r, i) => ({
        observationId: observationIds[i]!, type: r.type, attributes: r.attributes, eventTime: r.time.at,
      })));
      await tx.query(`UPDATE ingest.submission_items SET status = 'accepted', resolution_decision_id = $2, warnings = $3 WHERE id = $1`,
        [itemId, resolution.decisionId, JSON.stringify([])]);
      return observationIds;
    });
  }

  private async finalise(submissionId: string): Promise<void> {
    const { rows } = await this.pool.query<{ status: string; n: number }>(
      'SELECT status, count(*)::int AS n FROM ingest.submission_items WHERE submission_id = $1 GROUP BY status', [submissionId]);
    const count = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
    const total = rows.reduce((a, r) => a + r.n, 0);
    const status = count('accepted') === total ? 'processed' : count('accepted') === 0 && count('needs_review') === 0 ? 'rejected' : 'partially_accepted';
    await this.pool.query('UPDATE ingest.submissions SET status = $2 WHERE id = $1', [submissionId, status]);
  }

  /** A reviewer resolves an ambiguous item; the item is then processed against the chosen vehicle. */
  async resolveAmbiguousItem(itemId: string, choice: { vehicleId?: string; createNew?: boolean }, reviewerId: string): Promise<SubmissionResult> {
    const { rows } = await this.pool.query<{ submission_id: string; sequence: number; raw_item: SubmissionItemInput; status: string; resolution_decision_id: string; source_id: string }>(
      `SELECT i.submission_id, i.sequence, i.raw_item, i.status, i.resolution_decision_id, s.source_id
         FROM ingest.submission_items i JOIN ingest.submissions s ON s.id = i.submission_id WHERE i.id = $1`, [itemId]);
    const row = rows[0];
    if (!row || row.status !== 'needs_review') throw new Error('item is not waiting for review');
    const source = (await this.sources.list()).find((s) => s.id === row.source_id)!;
    let decided: Resolution | undefined;
    await this.bus.transaction(async (tx) => {
      decided = await this.registry.decideAmbiguous(tx, row.resolution_decision_id, choice, reviewerId);
    });
    const ids = await this.processItem(source, row.submission_id, row.sequence, row.raw_item, { legacyImport: true }, decided);
    await this.finalise(row.submission_id);
    const result = (await this.get(row.submission_id))!;
    return { ...result, replayed: false, items: result.items.map((it) => (it.sequence === row.sequence ? { ...it, observationIds: ids } : it)) };
  }

  /** A reviewer rejects an ambiguous item: a new "rejected" decision, and the item is rejected. */
  async rejectAmbiguousItem(itemId: string, reviewerId: string): Promise<void> {
    const { rows } = await this.pool.query<{ status: string; resolution_decision_id: string; submission_id: string }>(
      'SELECT status, resolution_decision_id, submission_id FROM ingest.submission_items WHERE id = $1', [itemId]);
    const row = rows[0];
    if (!row || row.status !== 'needs_review') throw new Error('item is not waiting for review');
    await this.bus.transaction(async (tx) => {
      const decisionId = await this.registry.rejectAmbiguous(tx, row.resolution_decision_id, reviewerId);
      await tx.query(`UPDATE ingest.submission_items SET status = 'rejected', resolution_decision_id = $2, errors = $3 WHERE id = $1`,
        [itemId, decisionId, JSON.stringify([{ path: 'identifiers', code: 'rejected_by_reviewer', message: 'a reviewer could not match this vehicle' }])]);
    });
    await this.finalise(row.submission_id);
  }

  async get(submissionId: string): Promise<Omit<SubmissionResult, 'replayed'> | undefined> {
    const { rows } = await this.pool.query<{ id: string; status: SubmissionResult['status']; code: string }>(
      'SELECT s.id, s.status, src.code FROM ingest.submissions s JOIN ingest.sources src ON src.id = s.source_id WHERE s.id = $1', [submissionId]);
    if (!rows[0]) return undefined;
    const items = await this.pool.query<{ sequence: number; status: ItemResult['status']; errors: ItemResult['errors']; id: string }>(
      'SELECT id, sequence, status, errors FROM ingest.submission_items WHERE submission_id = $1 ORDER BY sequence', [submissionId]);
    const results: ItemResult[] = [];
    for (const it of items.rows) {
      const r: ItemResult = { sequence: it.sequence, status: it.status, errors: it.errors };
      const d = await this.registry.latestDecisionForItem(it.id);
      if (d) {
        r.resolution = d.outcome as Resolution['outcome'];
        r.decisionId = d.id;
        if (d.matchedVehicleId) {
          r.vehicleId = d.matchedVehicleId;
          r.vehicleRef = (await this.registry.getVehicle(d.matchedVehicleId))?.publicRef;
        }
      }
      results.push(r);
    }
    return { submissionId, sourceCode: rows[0].code, status: rows[0].status, items: results };
  }

  /** Items waiting for a reviewer (ambiguous identity). */
  async itemsNeedingReview(): Promise<{ itemId: string; submissionId: string; sequence: number; candidates: string[]; presented: unknown }[]> {
    const { rows } = await this.pool.query<{ itemId: string; submissionId: string; sequence: number }>(
      `SELECT id AS "itemId", submission_id AS "submissionId", sequence FROM ingest.submission_items WHERE status = 'needs_review' ORDER BY id`);
    const out = [];
    for (const r of rows) {
      const d = await this.registry.latestDecisionForItem(r.itemId);
      out.push({ ...r, candidates: d?.candidates ?? [], presented: d?.presented });
    }
    return out;
  }
}
