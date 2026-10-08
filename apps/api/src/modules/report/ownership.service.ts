// "My cars" (O-007, decided 8 Oct 2026). A person proves a car is theirs by:
//   1. phone match — their signed-in phone equals the phone on the latest registry owner record → confirmed now;
//   2. logbook photo — a SAZO reviewer approves or rejects it.
// A confirmed owner can confirm or dispute garage visits on their car (registered-owner answers weigh more,
// Rule Set §2). The claim ends when a later change of owner is recorded.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { EventBus } from '../../platform/event-bus.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IamService, type Actor } from '../iam/index.js';
import { NotificationsService } from '../notify/index.js';
import { EvidenceService, ObservationsService, PartiesService } from '../obs/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { ReportNotFound, ReportsService } from './reports.service.js';

export class OwnershipError extends Error {
  constructor(readonly code: 'no_phone_match' | 'already_claimed' | 'logbook_invalid' | 'not_owner' | 'visit_not_found' | 'already_answered' | 'before_your_time' | 'claim_not_found', message: string) {
    super(message);
  }
}

interface ClaimRow { id: string; userId: string; vehicleId: string; method: 'phone_match' | 'logbook'; status: string; evidenceIds: string[]; decisionReason: string | null; createdAt: Date; decidedAt: Date | null }
const COLS = `id, user_id AS "userId", vehicle_id AS "vehicleId", method, status, evidence_ids AS "evidenceIds", decision_reason AS "decisionReason", created_at AS "createdAt", decided_at AS "decidedAt"`;

@Injectable()
export class OwnershipService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(PartiesService) private readonly parties: PartiesService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  private async vehicle(ref: string) {
    const id = await this.registry.idForRef(ref);
    if (!id) throw new ReportNotFound(ref);
    return { id, family: await this.registry.mergeFamily(id) };
  }

  private async live(userId: string, vehicleId: string): Promise<ClaimRow | undefined> {
    const { rows } = await this.pool.query<ClaimRow>(`SELECT ${COLS} FROM report.ownership_claims WHERE user_id = $1 AND vehicle_id = $2 AND status IN ('pending','verified')`, [userId, vehicleId]);
    return rows[0];
  }

  /** Claim a car: phone match first; otherwise the logbook photo goes to a reviewer. */
  async claim(actor: Actor, ref: string, logbookEvidenceId?: string): Promise<{ status: 'verified' | 'pending'; method: 'phone_match' | 'logbook' }> {
    const { id, family } = await this.vehicle(ref);
    const existing = await this.live(actor.userId, id);
    if (existing) return { status: existing.status as 'verified' | 'pending', method: existing.method };

    const phone = await this.iam.userPhone(actor.userId);
    const owner = await this.observations.currentOwnerParty(family);
    if (phone && owner && (await this.parties.phoneMatches(owner.partyId, phone))) {
      await this.insert(actor.userId, id, 'phone_match', 'verified', []);
      return { status: 'verified', method: 'phone_match' };
    }
    if (!logbookEvidenceId) throw new OwnershipError('no_phone_match', 'Your phone number is not the one on the registry record. Send a photo of the logbook instead.');
    const [file] = await this.evidence.view([logbookEvidenceId]);
    if (!file || file.uploadedBy !== actor.userId || file.kind !== 'official_document') throw new OwnershipError('logbook_invalid', 'Upload the logbook photo first');
    await this.insert(actor.userId, id, 'logbook', 'pending', [logbookEvidenceId]);
    return { status: 'pending', method: 'logbook' };
  }

  private async insert(userId: string, vehicleId: string, method: string, status: string, evidenceIds: string[]) {
    await this.pool.query(
      `INSERT INTO report.ownership_claims (user_id, vehicle_id, method, status, evidence_ids, decided_at) VALUES ($1,$2,$3,$4,$5, CASE WHEN $4 = 'verified' THEN now() END)`,
      [userId, vehicleId, method, status, evidenceIds]).catch((err: { code?: string }) => {
      if (err.code === '23505') throw new OwnershipError('already_claimed', 'You have already claimed this car');
      throw err;
    });
  }

  /** A verified claim ends when the car changes hands after it was confirmed (or the registry names someone else). */
  private async stillOwner(c: ClaimRow, family: string[]): Promise<boolean> {
    if (c.status !== 'verified' || !c.decidedAt) return c.status === 'verified';
    if (await this.observations.ownershipChangedSince(family, c.decidedAt.toISOString())) return false;
    if (c.method === 'phone_match') {
      const phone = await this.iam.userPhone(c.userId);
      const owner = await this.observations.currentOwnerParty(family);
      return !!(phone && owner && (await this.parties.phoneMatches(owner.partyId, phone)));
    }
    return true;
  }

  async myCars(userId: string) {
    const { rows } = await this.pool.query<ClaimRow>(
      `SELECT ${COLS} FROM report.ownership_claims WHERE user_id = $1 AND status IN ('pending','verified','rejected') ORDER BY created_at DESC LIMIT 50`, [userId]);
    const out = [];
    for (const c of rows) {
      const v = await this.registry.getVehicle(c.vehicleId);
      if (!v) continue;
      const family = await this.registry.mergeFamily(c.vehicleId);
      if (c.status === 'verified' && !(await this.stillOwner(c, family))) {
        await this.pool.query(`UPDATE report.ownership_claims SET status = 'ended', ended_at = now() WHERE id = $1`, [c.id]);
        continue;
      }
      const summary = await this.reports.publicSummary(v.publicRef).catch(() => undefined);
      out.push({ vehicleRef: v.publicRef, status: c.status, method: c.method, claimedAt: c.createdAt.toISOString(), reason: c.status === 'rejected' ? c.decisionReason : null, summary });
    }
    return out;
  }

  async withdraw(userId: string, ref: string): Promise<void> {
    const id = await this.registry.idForRef(ref);
    if (id) await this.pool.query(`UPDATE report.ownership_claims SET status = 'withdrawn', ended_at = now() WHERE user_id = $1 AND vehicle_id = $2 AND status IN ('pending','verified')`, [userId, id]);
  }

  private async requireOwner(userId: string, ref: string) {
    const { id, family } = await this.vehicle(ref);
    const c = await this.live(userId, id);
    if (!c || c.status !== 'verified' || !(await this.stillOwner(c, family))) throw new OwnershipError('not_owner', 'Only the confirmed owner can do this');
    return { id, family };
  }

  /** The owner's private party (by their signed-in phone) — answers are recorded against it. */
  private async ownerParty(userId: string): Promise<string> {
    const phone = await this.iam.userPhone(userId);
    if (!phone) throw new OwnershipError('not_owner', 'Only the confirmed owner can do this');
    return this.parties.upsertPerson({ phone });
  }

  /**
   * Garage visits on my car. An owner can only vouch for visits made while the car was theirs — on or after
   * the latest registration / change-of-owner record — and answers once per visit.
   */
  async visits(userId: string, ref: string) {
    const { family } = await this.requireOwner(userId, ref);
    const party = await this.ownerParty(userId);
    const since = await this.observations.ownershipStart(family);
    const { items } = await this.reports.timeline(ref);
    const garage = items.filter((e) => e.type === 'garage_job');
    return Promise.all(garage.map(async (e) => {
      const ownerAnswer = (await this.observations.ownerAnswer(e.eventId, party)) ?? null;
      const inMyTime = !since || (e.time.at !== null && e.time.at >= since);
      return { ...e, ownerAnswer, canAnswer: inMyTime && ownerAnswer === null };
    }));
  }

  async answerVisit(userId: string, ref: string, eventId: string, response: 'confirmed' | 'disputed', comment?: string): Promise<void> {
    const visit = (await this.visits(userId, ref)).find((e) => e.eventId === eventId);
    if (!visit) throw new OwnershipError('visit_not_found', 'No such visit on this car');
    if (visit.ownerAnswer) throw new OwnershipError('already_answered', 'You have already answered for this visit');
    if (!visit.canAnswer) throw new OwnershipError('before_your_time', 'This visit was before the car was yours');
    const party = await this.ownerParty(userId);
    await this.bus.transaction(async (tx, emit) => {
      await this.observations.recordAttestation(emit, tx, { eventId, attesterKind: 'registered_owner', response, channel: 'app', partyId: party, comment: comment ?? null });
    });
  }

  // ---------- SAZO reviewers
  async pending() {
    const { rows } = await this.pool.query<ClaimRow>(`SELECT ${COLS} FROM report.ownership_claims WHERE status = 'pending' ORDER BY created_at LIMIT 100`);
    const names = await this.iam.displayNames(rows.map((r) => r.userId));
    return Promise.all(rows.map(async (c) => {
      const v = await this.registry.getVehicle(c.vehicleId);
      const summary = v ? await this.reports.publicSummary(v.publicRef).catch(() => undefined) : undefined;
      return { claimId: c.id, vehicleRef: v?.publicRef, plate: summary?.vehicle.currentPlate ?? null, claimant: names.get(c.userId) ?? '', claimedAt: c.createdAt.toISOString(), evidenceIds: c.evidenceIds };
    }));
  }

  async decide(reviewer: Actor, claimId: string, decision: 'approve' | 'reject', reason: string): Promise<boolean> {
    const { rows } = await this.pool.query<ClaimRow>(
      `UPDATE report.ownership_claims SET status = $2, reviewer_user_id = $3, decision_reason = $4, decided_at = now()
        WHERE id = $1 AND status = 'pending' RETURNING ${COLS}`, [claimId, decision === 'approve' ? 'verified' : 'rejected', reviewer.userId, reason]);
    const c = rows[0];
    if (!c) return false;
    await this.iam.audit({ actor: reviewer, action: `ownership.${decision}`, targetType: 'ownership_claim', targetId: claimId, details: { reason } });
    const phone = await this.iam.userPhone(c.userId);
    const v = await this.registry.getVehicle(c.vehicleId);
    const plate = v ? (await this.reports.publicSummary(v.publicRef).catch(() => undefined))?.vehicle.currentPlate : undefined;
    if (phone) await this.notify.sendSmsToPhone(phone, decision === 'approve' ? 'ownership_approved' : 'ownership_rejected', { plate: plate ?? 'your car' }, 'account', c.userId).catch(() => false);
    return true;
  }

  /** Account deletion: every claim is withdrawn. */
  async withdrawAll(userId: string): Promise<void> {
    await this.pool.query(`UPDATE report.ownership_claims SET status = 'withdrawn', ended_at = now() WHERE user_id = $1 AND status IN ('pending','verified')`, [userId]);
  }
}
