// Conflict review (DM-13, API Outline §5.9). Reviewers never edit observations: they resolve or dismiss
// the conflict with reasoning, optionally recording corrects/retracts/duplicates relations and — for a
// cloned plate — which vehicle keeps the plate. Trust then recomputes every affected vehicle.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { EventBus } from '../../platform/event-bus.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IngestionService } from '../ingest/index.js';
import { ObservationsService } from '../obs/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { TrustService } from './trust.service.js';

export type ConflictStatus = 'open' | 'under_review' | 'auto_resolved' | 'resolved' | 'dismissed';

export interface ConflictAction {
  action: 'assign' | 'comment' | 'start_review' | 'resolve' | 'dismiss' | 'reopen';
  assigneeUserId?: string;
  comment?: string;
  interpretation?: string;
  reasoning?: string;
  relations?: { kind: 'corrects' | 'retracts' | 'duplicates'; fromObservationId: string; toObservationId: string }[];
  plateDispute?: { plate: string; keepVehicleRef: string };
}

export class ConflictActionError extends Error {
  constructor(readonly code: 'invalid_transition' | 'reasoning_required' | 'observation_not_in_conflict' | 'invalid_plate_dispute', message: string) {
    super(message);
  }
}

interface ConflictRow {
  id: string; vehicleId: string; topic: string; status: ConflictStatus; observationIds: string[]; openedByCheck: string | null;
  assignedTo: string | null; resolution: { interpretation?: string; reasoning?: string } | null; openedAt: Date; resolvedAt: Date | null;
}

const SELECT = `SELECT id, vehicle_id AS "vehicleId", topic, status, observation_ids AS "observationIds", opened_by_check AS "openedByCheck",
                       assigned_to_user_id AS "assignedTo", resolution, opened_at AS "openedAt", resolved_at AS "resolvedAt"
                  FROM trust.conflicts`;
const ACTIVE: ConflictStatus[] = ['open', 'under_review'];

@Injectable()
export class ConflictsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(TrustService) private readonly trust: TrustService,
  ) {}

  private async view(c: ConflictRow) {
    const ref = (await this.registry.getVehicle(c.vehicleId))?.publicRef;
    const related = c.topic === 'identity'
      ? [...new Set((await this.registry.identityAlerts(c.vehicleId)).flatMap((a) => a.relatedVehicleIds))]
      : [];
    const relatedRefs = (await Promise.all(related.map(async (id) => (await this.registry.getVehicle(id))?.publicRef))).filter(Boolean) as string[];
    return {
      conflictId: c.id,
      vehicleRef: ref!,
      relatedVehicleRefs: relatedRefs,
      topic: c.topic,
      status: c.status,
      openedByCheck: c.openedByCheck,
      assignedTo: c.assignedTo,
      openedAt: new Date(c.openedAt).toISOString(),
      resolvedAt: c.resolvedAt ? new Date(c.resolvedAt).toISOString() : null,
    };
  }

  async list(filter: { status?: ConflictStatus; topic?: string; limit?: number }) {
    const { rows } = await this.pool.query<ConflictRow>(
      `${SELECT} WHERE status = ANY($1) AND ($2::text IS NULL OR topic = $2) ORDER BY opened_at, id LIMIT $3`,
      [filter.status ? [filter.status] : ACTIVE, filter.topic ?? null, filter.limit ?? 50],
    );
    return Promise.all(rows.map((r) => this.view(r)));
  }

  private async row(id: string): Promise<ConflictRow | undefined> {
    return (await this.pool.query<ConflictRow>(`${SELECT} WHERE id = $1`, [id])).rows[0];
  }

  /** Reviewer audience: the competing records side by side, with their full attributes and sources. */
  async detail(id: string) {
    const c = await this.row(id);
    if (!c) return undefined;
    const family = await this.registry.mergeFamily(c.vehicleId);
    const [obs, sources, activity, idents] = await Promise.all([
      this.observations.listForVehicles(family),
      this.ingestion.listSources(),
      this.pool.query(`SELECT kind, actor_user_id AS actor, at, details FROM trust.conflict_activities WHERE conflict_id = $1 ORDER BY at, id`, [id]),
      this.registry.identifiers(c.vehicleId),
    ]);
    const code = new Map(sources.map((s) => [s.id, s.code]));
    return {
      ...(await this.view(c)),
      observations: obs.filter((o) => c.observationIds.includes(o.id)).map((o) => ({
        id: o.id, type: o.type, attributes: o.attributes, eventTime: o.eventTime, precision: o.precision,
        recordedAt: o.recordedAt, sourceCode: code.get(o.sourceId), evidenceClass: o.evidenceClass, evidenceKinds: o.evidenceKinds,
      })),
      disputedPlates: idents.filter((i) => i.type === 'registration_plate' && i.status === 'disputed').map((i) => i.valueRaw),
      activity: activity.rows.map((a) => ({ ...a, at: new Date(a.at).toISOString() })),
      resolution: c.resolution,
    };
  }

  async act(id: string, actorUserId: string, a: ConflictAction) {
    const before = await this.row(id);
    if (!before) return undefined;
    const isActive = ACTIVE.includes(before.status);
    const need = (cond: boolean, msg: string) => {
      if (!cond) throw new ConflictActionError('invalid_transition', msg);
    };
    const affected = new Set<string>();

    await this.bus.transaction(async (tx, emit) => {
      const activity = (kind: string, details: object) =>
        tx.query('INSERT INTO trust.conflict_activities (conflict_id, kind, actor_user_id, details) VALUES ($1,$2,$3,$4)', [id, kind, actorUserId, JSON.stringify(details)]);

      switch (a.action) {
        case 'comment':
          if (!a.comment?.trim()) throw new ConflictActionError('reasoning_required', 'comment is required');
          await activity('commented', { comment: a.comment });
          return;
        case 'assign':
          need(isActive, 'only open conflicts can be assigned');
          await tx.query('UPDATE trust.conflicts SET assigned_to_user_id = $2 WHERE id = $1', [id, a.assigneeUserId ?? actorUserId]);
          await activity('assigned', { to: a.assigneeUserId ?? actorUserId });
          return;
        case 'start_review':
          need(before.status === 'open', 'only open conflicts can move to review');
          await tx.query(`UPDATE trust.conflicts SET status = 'under_review', assigned_to_user_id = COALESCE(assigned_to_user_id, $2) WHERE id = $1`, [id, actorUserId]);
          await activity('status_changed', { from: 'open', to: 'under_review' });
          return;
        case 'reopen':
          need(!isActive, 'this conflict is already open');
          await tx.query(`UPDATE trust.conflicts SET status = 'open', resolved_at = NULL WHERE id = $1`, [id]);
          await activity('reopened', { reasoning: a.reasoning ?? null });
          affected.add(before.vehicleId);
          return;
        case 'resolve':
        case 'dismiss': {
          need(isActive, 'this conflict is already closed');
          if (!a.reasoning?.trim() || (a.action === 'resolve' && !a.interpretation?.trim())) {
            throw new ConflictActionError('reasoning_required', a.action === 'resolve' ? 'interpretation and reasoning are required' : 'reasoning is required');
          }
          const family = new Set(await this.registry.mergeFamily(before.vehicleId));
          const familyObs = new Set((await this.observations.listForVehicles([...family])).map((o) => o.id));
          for (const r of a.relations ?? []) {
            if (!familyObs.has(r.fromObservationId) || !familyObs.has(r.toObservationId)) {
              throw new ConflictActionError('observation_not_in_conflict', 'relations must link records of this vehicle');
            }
            await this.observations.addRelation(emit, tx, { from: r.fromObservationId, to: r.toObservationId, kind: r.kind, reason: a.reasoning, byUserId: actorUserId });
          }
          if (a.plateDispute) {
            const keep = await this.registry.idForRef(a.plateDispute.keepVehicleRef);
            if (!keep) throw new ConflictActionError('invalid_plate_dispute', 'keepVehicleRef not found');
            try {
              for (const v of await this.registry.resolvePlateDispute(tx, a.plateDispute.plate, keep)) affected.add(v);
            } catch (err) {
              throw new ConflictActionError('invalid_plate_dispute', (err as Error).message);
            }
          }
          const status = a.action === 'resolve' ? 'resolved' : 'dismissed';
          await tx.query(
            `UPDATE trust.conflicts SET status = $2, resolution = $3, resolved_by_user_id = $4, resolved_at = now() WHERE id = $1`,
            [id, status, JSON.stringify({ interpretation: a.interpretation ?? null, reasoning: a.reasoning }), actorUserId],
          );
          await activity('resolved', { status, interpretation: a.interpretation ?? null, reasoning: a.reasoning, relations: a.relations ?? [], plateDispute: a.plateDispute ?? null });
          affected.add(before.vehicleId);
          return;
        }
      }
    });

    for (const v of affected) await this.trust.recompute(v, 'manual');
    return this.view((await this.row(id))!);
  }
}
