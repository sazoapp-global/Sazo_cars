// Trust — module 5 (Domain Model §5). Runs Rule Set v1 (@sazo/trust-engine) whenever a vehicle's
// evidence changes and stores the result as a derivation run (DM-12). Owns the `trust` schema.
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  evaluateVehicle,
  PARAMS,
  RULE_SET_VERSION,
  type EngineSource,
  type EvaluationResult,
  type HealthResult,
  type VehicleInput,
} from '@sazo/trust-engine';
import pg from 'pg';
import { EventBus } from '../../platform/event-bus.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IngestionService } from '../ingest/index.js';
import { ObservationsService } from '../obs/index.js';
import { ReferenceService } from '../ref/index.js';
import { VehicleRegistry } from '../vehicle/index.js';

export interface TrustSnapshot {
  runId: string;
  vehicleId: string;
  asOf: string;
  ruleSetVersion: string;
  questions: { question: string; status: string; headlineKey: string; params: Record<string, unknown>; notes: unknown[]; basis: string[] }[];
  facts: Record<string, { value: unknown; confidence: number; estimated: boolean; supporting: string[] }>;
  recordConfidence: { level: string; records: number; sources: number; openConflicts: number };
  flags: { check: string; severity: string; observationIds: string[] }[];
  assessments: Map<string, { confidence: number; weak: boolean; excluded: boolean; exclusionReason: string | null; factors: Record<string, unknown> }>;
  openConflicts: { id: string; topic: string; status: string; observationIds: string[] }[];
  health?: HealthResult;
}

@Injectable()
export class TrustService implements OnModuleInit {
  private readonly log = new Logger('Trust');

  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(ReferenceService) private readonly reference: ReferenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pool.query(
      `INSERT INTO trust.rule_sets (version, description, parameters, activated_at) VALUES ($1, 'Rule Set v1', $2, now())
       ON CONFLICT (version) DO NOTHING`,
      [RULE_SET_VERSION, JSON.stringify(PARAMS)],
    );
    const onChange = async (e: { payload: Record<string, unknown> }) => {
      await this.recompute(String(e.payload.vehicleId), 'observation');
    };
    this.bus.subscribe('observation.recorded', onChange);
    this.bus.subscribe('observation.related', onChange);
    this.bus.subscribe('attestation.received', async (e) => {
      await this.recompute(String(e.payload.vehicleId), 'attestation');
    });
    // A paused/retired/superseded source changes how its records are weighed (X1) — re-weigh its vehicles.
    this.bus.subscribe('ingest.source_changed', async (e) => {
      for (const id of await this.observations.vehiclesWithSource(String(e.payload.sourceId))) await this.recompute(id, 'full_rebuild');
    });
  }

  /**
   * Recompute one vehicle or every live vehicle. Runs in-process for now (the BullMQ worker comes later);
   * each vehicle gets a new derivation run, the previous ones stay for audit (DM-12).
   */
  async rebuild(opts: { vehicleId?: string; asOf?: string } = {}): Promise<number> {
    const ids = opts.vehicleId ? [opts.vehicleId] : await this.registry.liveVehicleIds();
    for (const id of ids) await this.recompute(id, opts.vehicleId ? 'manual' : 'full_rebuild', opts.asOf);
    return ids.length;
  }

  /** Recompute one vehicle (following merges to the survivor) and store a new run. */
  async recompute(vehicleId: string, trigger: 'observation' | 'attestation' | 'merge' | 'manual' | 'full_rebuild', asOf = new Date().toISOString()): Promise<string> {
    let v = await this.registry.getVehicle(vehicleId);
    while (v?.mergedIntoId) v = await this.registry.getVehicle(v.mergedIntoId);
    if (!v) throw new Error(`vehicle ${vehicleId} not found`);
    const family = await this.registry.mergeFamily(v.id);

    const [stored, relations, attestations, identifiers, alerts, sources, stats] = await Promise.all([
      this.observations.listForVehicles(family),
      this.observations.relationsFor(family),
      this.observations.attestationsFor(family),
      this.registry.identifiers(v.id),
      this.registry.identityAlerts(v.id),
      this.ingestion.listSources(),
      this.observations.attestationStatsBySource(),
    ]);

    const engineSources = new Map<string, EngineSource>(sources.map((s) => [s.id, {
      id: s.id,
      organisationId: s.organisationId,
      domain: s.domain,
      evidenceClass: s.evidenceClass,
      isSimulated: s.isSimulated,
      status: s.status,
      ...(s.supersededBySourceId ? { supersededBySourceId: s.supersededBySourceId } : {}),
      ...(s.evidenceClass === 'garage' ? { attestationStats: stats.get(s.id) ?? { confirmed: 0, disputed: 0 } } : {}),
      coverage: s.coverage as EngineSource['coverage'],
    }]));

    const input: VehicleInput = {
      vehicleId: v.id,
      status: v.status === 'provisional' ? 'provisional' : v.status === 'retired' ? 'retired' : 'active',
      identifiers: identifiers.filter((i) => i.status !== 'historical').map((i) => ({ type: i.type, value: i.valueRaw })),
      observations: stored.map((o) => ({
        id: o.id, type: o.type, attributes: o.attributes, eventTime: o.eventTime, precision: o.precision,
        recordedAt: o.recordedAt, sourceId: o.sourceId, ...(o.eventId ? { eventId: o.eventId } : {}), evidenceKinds: o.evidenceKinds,
      })),
      relations,
      attestations,
      identityAlerts: alerts,
    };

    const spec = stored.filter((o) => o.type === 'spec_declared').sort((a, b) =>
      Number(b.evidenceClass === 'official') - Number(a.evidenceClass === 'official'))[0]?.attributes;
    const comparablesCount = await this.reference.comparablesCount(spec?.make as string, spec?.model as string, spec?.year as number, asOf);

    let result = evaluateVehicle(input, { asOf, sources: engineSources, comparablesCount });
    // A reviewer's resolution closes a conflict only for the observations it covered; new evidence reopens it.
    const closed = await this.closedTopics(v.id, result);
    if (closed.length) result = evaluateVehicle({ ...input, closedConflictKeys: closed }, { asOf, sources: engineSources, comparablesCount });

    const runId = await this.persist(v.id, result, trigger);
    return runId;
  }

  private async closedTopics(vehicleId: string, result: EvaluationResult): Promise<string[]> {
    const { rows } = await this.pool.query<{ topic: string; observation_ids: string[] }>(
      `SELECT DISTINCT ON (topic) topic, observation_ids FROM trust.conflicts
        WHERE vehicle_id = $1 AND status IN ('resolved','dismissed') ORDER BY topic, resolved_at DESC`,
      [vehicleId],
    );
    return result.conflicts
      .filter((c) => rows.some((r) => r.topic === c.topic && c.observationIds.every((id) => r.observation_ids.includes(id))))
      .map((c) => c.topic);
  }

  private async persist(vehicleId: string, r: EvaluationResult, trigger: string): Promise<string> {
    return this.bus.transaction(async (tx, emit) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO trust.derivation_runs (vehicle_id, rule_set_version, as_of, trigger, status, finished_at)
         VALUES ($1,$2,$3,$4,'succeeded', now()) RETURNING id`,
        [vehicleId, r.ruleSetVersion, r.asOf, trigger],
      );
      const runId = rows[0]!.id;

      for (const a of r.assessments) {
        await tx.query(
          `INSERT INTO trust.observation_assessments (run_id, observation_id, vehicle_id, confidence, weak, excluded, exclusion_reason, factors)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [runId, a.observationId, vehicleId, a.confidence, a.weak, a.excluded, a.exclusionReason ?? null, JSON.stringify(a.factors)],
        );
      }
      for (const f of r.flags) {
        await tx.query(
          `INSERT INTO trust.consistency_flags (run_id, vehicle_id, check_code, severity, observation_ids, details) VALUES ($1,$2,$3,$4,$5,$6)`,
          [runId, vehicleId, f.check, f.severity, f.observationIds, JSON.stringify(f.details ?? {})],
        );
      }
      for (const [key, fact] of Object.entries(r.facts)) {
        await tx.query(
          `INSERT INTO trust.canonical_facts (run_id, vehicle_id, key, value, confidence, estimated, supporting_observation_ids)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [runId, vehicleId, key, JSON.stringify(fact.value), fact.confidence, fact.estimated ?? false, fact.supporting],
        );
      }
      for (const q of Object.values(r.questions)) {
        await tx.query(
          `INSERT INTO trust.question_assessments (run_id, vehicle_id, question, status, headline_key, params, notes, coverage, basis_observation_ids)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'{}',$8)`,
          [runId, vehicleId, q.question, q.status, q.headlineKey, JSON.stringify(q.params ?? {}), JSON.stringify(q.notes), q.basis],
        );
      }
      await tx.query('INSERT INTO trust.record_confidences (run_id, vehicle_id, level, factors) VALUES ($1,$2,$3,$4)', [
        runId, vehicleId, r.recordConfidence.level,
        JSON.stringify({ records: r.recordConfidence.records, sources: r.recordConfidence.sources, openConflicts: r.recordConfidence.openConflicts }),
      ]);

      // Conflicts have a human lifecycle (DM-13): update open ones, open new ones, auto-resolve cleared ones.
      const open = await tx.query<{ id: string; topic: string }>(
        `SELECT id, topic FROM trust.conflicts WHERE vehicle_id = $1 AND status IN ('open','under_review')`, [vehicleId]);
      const byTopic = new Map(open.rows.map((c) => [c.topic, c.id]));
      for (const c of r.conflicts.filter((x) => x.open)) {
        const existing = byTopic.get(c.topic);
        if (existing) {
          await tx.query('UPDATE trust.conflicts SET observation_ids = $2 WHERE id = $1', [existing, c.observationIds]);
          byTopic.delete(c.topic);
        } else {
          const ins = await tx.query<{ id: string }>(
            `INSERT INTO trust.conflicts (vehicle_id, topic, observation_ids, opened_by_check) VALUES ($1,$2,$3,$4) RETURNING id`,
            [vehicleId, c.topic, c.observationIds, c.openedByCheck]);
          await tx.query(`INSERT INTO trust.conflict_activities (conflict_id, kind, details) VALUES ($1,'opened',$2)`,
            [ins.rows[0]!.id, JSON.stringify({ check: c.openedByCheck, runId })]);
          await emit('trust', { type: 'trust.conflict_opened', aggregateId: vehicleId, payload: { vehicleId, conflictId: ins.rows[0]!.id, topic: c.topic } });
        }
      }
      for (const [, id] of byTopic) {
        await tx.query(`UPDATE trust.conflicts SET status = 'auto_resolved', resolved_by_rule = $2, resolved_at = now() WHERE id = $1`,
          [id, `${r.ruleSetVersion}:cause_cleared`]);
        await tx.query(`INSERT INTO trust.conflict_activities (conflict_id, kind, details) VALUES ($1,'resolved',$2)`,
          [id, JSON.stringify({ rule: `${r.ruleSetVersion}:cause_cleared`, runId })]);
      }

      await tx.query(
        `INSERT INTO trust.vehicle_current_run (vehicle_id, run_id, updated_at) VALUES ($1,$2,now())
         ON CONFLICT (vehicle_id) DO UPDATE SET run_id = EXCLUDED.run_id, updated_at = now()`,
        [vehicleId, runId],
      );
      await this.reference.saveHealth(tx, { vehicleId, runId, ruleSetVersion: r.ruleSetVersion, asOf: r.asOf, health: r.health });
      await emit('trust', { type: 'trust.vehicle_updated', aggregateId: vehicleId, payload: { vehicleId, runId } });
      return runId;
    });
  }

  /** The vehicle's current trust snapshot (what every screen reads). */
  async current(vehicleId: string): Promise<TrustSnapshot | undefined> {
    const run = await this.pool.query<{ run_id: string; as_of: Date; rule_set_version: string }>(
      `SELECT c.run_id, r.as_of, r.rule_set_version FROM trust.vehicle_current_run c JOIN trust.derivation_runs r ON r.id = c.run_id
        WHERE c.vehicle_id = $1`, [vehicleId]);
    const head = run.rows[0];
    if (!head) return undefined;
    const runId = head.run_id;
    const [questions, facts, rc, flags, assessments, conflicts] = await Promise.all([
      this.pool.query(`SELECT question, status, headline_key AS "headlineKey", params, notes, basis_observation_ids AS basis
                         FROM trust.question_assessments WHERE run_id = $1`, [runId]),
      this.pool.query(`SELECT key, value, confidence::float, estimated, supporting_observation_ids AS supporting FROM trust.canonical_facts WHERE run_id = $1`, [runId]),
      this.pool.query(`SELECT level, factors FROM trust.record_confidences WHERE run_id = $1`, [runId]),
      this.pool.query(`SELECT check_code AS check, severity, observation_ids AS "observationIds" FROM trust.consistency_flags WHERE run_id = $1`, [runId]),
      this.pool.query(`SELECT observation_id, confidence::float, weak, excluded, exclusion_reason, factors FROM trust.observation_assessments WHERE run_id = $1`, [runId]),
      this.pool.query(`SELECT id, topic, status, observation_ids AS "observationIds" FROM trust.conflicts WHERE vehicle_id = $1 AND status IN ('open','under_review')`, [vehicleId]),
    ]);
    const order = ['identity', 'care', 'damage', 'mileage', 'provenance', 'legal_financial', 'valuation'];
    return {
      runId,
      vehicleId,
      asOf: new Date(head.as_of).toISOString(),
      ruleSetVersion: head.rule_set_version,
      questions: questions.rows.sort((a, b) => order.indexOf(a.question) - order.indexOf(b.question)),
      facts: Object.fromEntries(facts.rows.map((f) => [f.key, { value: f.value, confidence: f.confidence, estimated: f.estimated, supporting: f.supporting }])),
      recordConfidence: { level: rc.rows[0]?.level ?? 'insufficient', ...(rc.rows[0]?.factors ?? { records: 0, sources: 0, openConflicts: 0 }) },
      flags: flags.rows,
      assessments: new Map(assessments.rows.map((a) => [a.observation_id, {
        confidence: a.confidence, weak: a.weak, excluded: a.excluded, exclusionReason: a.exclusion_reason, factors: a.factors,
      }])),
      openConflicts: conflicts.rows,
      health: await this.reference.healthForRun(runId),
    };
  }
}
