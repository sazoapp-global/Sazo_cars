// Concerns raised by businesses (O-002): a garage or inspector reports signs of fraud on a car; SAZO staff
// review every report. Open serious reports put a neutral "being checked" notice on the car; upheld reports
// say what SAZO confirmed; dismissed reports leave no trace for buyers. Owns the `concern` schema.
import { Inject, Injectable } from '@nestjs/common';
import { CONCERNS, type ConcernCategory } from '@sazo/contracts';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';
import { IamService, type Actor } from '../iam/index.js';
import { EvidenceService } from '../obs/index.js';
import { VehicleRegistry } from '../vehicle/index.js';

export class ConcernError extends Error {
  constructor(readonly code: 'vehicle_not_found' | 'evidence_invalid' | 'too_many_reports' | 'concern_not_found', message: string) {
    super(message);
  }
}

interface Row {
  id: string; vehicleId: string | null; plateEntered: string; organisationId: string; reporterUserId: string; category: ConcernCategory;
  severity: 'serious' | 'attention'; description: string; evidenceIds: string[]; status: 'open' | 'upheld' | 'dismissed';
  decisionReason: string | null; createdAt: Date; decidedAt: Date | null;
}
const COLS = `id, vehicle_id AS "vehicleId", plate_entered AS "plateEntered", organisation_id AS "organisationId", reporter_user_id AS "reporterUserId",
  category, severity, description, evidence_ids AS "evidenceIds", status, decision_reason AS "decisionReason", created_at AS "createdAt", decided_at AS "decidedAt"`;
/** A business can raise this many concerns a day (stops misuse against a competitor's cars). */
export const DAILY_LIMIT = 10;

export type VehicleNotice = { kind: 'under_review' } | { kind: 'upheld'; category: ConcernCategory };

@Injectable()
export class ConcernService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  async report(actor: Actor, organisationId: string, r: { plate: string; vehicleRef?: string; category: ConcernCategory; description: string; evidenceIds: string[] }) {
    let vehicleId: string | null = null;
    if (r.vehicleRef) {
      vehicleId = (await this.registry.idForRef(r.vehicleRef)) ?? null;
      if (!vehicleId) throw new ConcernError('vehicle_not_found', 'No such vehicle');
    } else {
      // Only a plate: link it when exactly one car has it; otherwise staff match it during review.
      const s = await this.registry.search(r.plate);
      if (s.matches.length === 1) vehicleId = (await this.registry.idForRef(s.matches[0]!.vehicleRef)) ?? null;
    }
    const files = await this.evidence.view(r.evidenceIds);
    if (files.length !== r.evidenceIds.length || !(await Promise.all(files.map((f) => f.uploadedBy ? this.iam.isActiveMember(f.uploadedBy, organisationId) : false))).every(Boolean)) {
      throw new ConcernError('evidence_invalid', 'A photo was not found — upload it again');
    }
    // Count and insert as one step, one business at a time, so many reports sent at once cannot beat the limit (S4).
    const client = await this.pool.connect();
    let rows: Row[];
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('concern:' || $1))`, [organisationId]);
      const { rows: [count] } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM concern.reports WHERE organisation_id = $1 AND created_at > now() - interval '1 day'`, [organisationId]);
      if (count!.n >= DAILY_LIMIT) throw new ConcernError('too_many_reports', `Your business can raise up to ${DAILY_LIMIT} concerns a day. Call SAZO if it is urgent.`);
      ({ rows } = await client.query<Row>(
        `INSERT INTO concern.reports (vehicle_id, plate_entered, organisation_id, reporter_user_id, category, severity, description, evidence_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
        [vehicleId, r.plate.toUpperCase(), organisationId, actor.userId, r.category, CONCERNS[r.category].severity, r.description, r.evidenceIds]));
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    await this.iam.audit({ actor, action: 'concern.report', targetType: 'concern', targetId: rows[0]!.id, details: { category: r.category } });
    return this.view(rows[0]!);
  }

  async forOrganisation(organisationId: string) {
    const { rows } = await this.pool.query<Row>(`SELECT ${COLS} FROM concern.reports WHERE organisation_id = $1 ORDER BY created_at DESC LIMIT 50`, [organisationId]);
    return Promise.all(rows.map((r) => this.view(r)));
  }

  private async view(r: Row) {
    const v = r.vehicleId ? await this.registry.getVehicle(r.vehicleId) : undefined;
    return {
      concernId: r.id, plate: r.plateEntered, ...(v ? { vehicleRef: v.publicRef } : {}), category: r.category, severity: r.severity,
      description: r.description, status: r.status, decisionReason: r.decisionReason,
      createdAt: new Date(r.createdAt).toISOString(), decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : null,
    };
  }

  // ---------- SAZO staff
  async queue(status: 'open' | 'upheld' | 'dismissed') {
    const { rows } = await this.pool.query<Row>(`SELECT ${COLS} FROM concern.reports WHERE status = $1 ORDER BY (severity = 'serious') DESC, created_at LIMIT 100`, [status]);
    const names = await this.iam.displayNames(rows.map((r) => r.reporterUserId));
    return Promise.all(rows.map(async (r) => {
      const org = await this.iam.organisation(r.organisationId);
      return { ...(await this.view(r)), evidenceIds: r.evidenceIds, reporter: names.get(r.reporterUserId) ?? '', organisation: org?.tradingName ?? org?.legalName ?? '', organisationType: org?.type };
    }));
  }

  /** Uphold or dismiss. Staff may also link the report to the right car (by reference) when the plate was unclear. */
  async decide(reviewer: Actor, id: string, d: { decision: 'uphold' | 'dismiss'; reason: string; vehicleRef?: string }): Promise<void> {
    let vehicleId: string | null = null;
    if (d.vehicleRef) {
      vehicleId = (await this.registry.idForRef(d.vehicleRef)) ?? null;
      if (!vehicleId) throw new ConcernError('vehicle_not_found', 'No such vehicle');
    }
    const r = await this.pool.query(
      `UPDATE concern.reports SET status = $2, reviewer_user_id = $3, decision_reason = $4, decided_at = now(), vehicle_id = COALESCE($5, vehicle_id)
        WHERE id = $1 AND status = 'open'`, [id, d.decision === 'uphold' ? 'upheld' : 'dismissed', reviewer.userId, d.reason, vehicleId]);
    if (r.rowCount !== 1) throw new ConcernError('concern_not_found', 'No such open concern');
    await this.iam.audit({ actor: reviewer, action: `concern.${d.decision}`, targetType: 'concern', targetId: id, details: { reason: d.reason } });
  }

  /** What buyers see about concerns on a car: "being checked" while a serious one is open; upheld ones by category. */
  async notices(vehicleIds: string[]): Promise<VehicleNotice[]> {
    const { rows } = await this.pool.query<{ status: string; category: ConcernCategory; severity: string }>(
      `SELECT DISTINCT status, category, severity FROM concern.reports WHERE vehicle_id = ANY($1) AND status IN ('open','upheld')`, [vehicleIds]);
    const out: VehicleNotice[] = [];
    if (rows.some((r) => r.status === 'open' && r.severity === 'serious')) out.push({ kind: 'under_review' });
    for (const c of new Set(rows.filter((r) => r.status === 'upheld').map((r) => r.category))) out.push({ kind: 'upheld', category: c });
    return out;
  }
}
