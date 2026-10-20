// Identity check for business managers (A-05; Accounts plan 1.5, D-104). A manager of a garage, inspection
// centre, dealer or data partner sends their National ID number (NIN) and a photo of their ID. A SAZO admin
// checks it: a business is approved only when every active manager has sent theirs, and approving the business
// approves those checks in the same step. A manager added later is checked on their own in the admin queue.
// The NIN is encrypted like other personal data and matched by keyed hash, so one NIN backs one person.
import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { PII_KEYRING, type Keyring } from '../../platform/keyring.js';
import { withTx, type Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import type { Actor } from './actor.js';
import { IamRepository } from './iam.repository.js';

export class IdentityError extends Error {
  constructor(readonly code: 'already_sent' | 'nin_in_use' | 'check_not_found' | 'already_decided' | 'manager_identity_missing', message: string) {
    super(message);
  }
}

export interface IdentityCheckView {
  checkId: string; status: 'pending' | 'approved' | 'rejected'; decisionReason: string | null; decidedAt: string | null; createdAt: string;
}

/** A Ugandan National ID number: 14 letters and digits (CM or CF and so on), stored in capitals. */
export const NIN_PATTERN = /^[A-Z0-9]{14}$/;

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamRepository) private readonly repo: IamRepository,
    @Inject(PII_KEYRING) private readonly keyring: Keyring,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private ninHash(nin: string): Buffer {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(`nin:${nin}`).digest();
  }

  /** Send a NIN and ID photo. The caller has already checked the photo is the person's own ID upload. */
  async submit(userId: string, nin: string, idPhotoEvidenceId: string): Promise<IdentityCheckView> {
    try {
      const id = await withTx(this.pool, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO iam.identity_checks (user_id, nin_ciphertext, nin_key_version, nin_hash, id_photo_evidence_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [userId, this.keyring.encrypt(nin), this.keyring.current, this.ninHash(nin), idPhotoEvidenceId]);
        await this.repo.audit(tx, { actorUserId: userId, action: 'identity.sent', targetType: 'user', targetId: userId });
        return rows[0]!.id;
      });
      return (await this.byId(id))!;
    } catch (err) {
      const c = err as { code?: string; constraint?: string };
      if (c.code === '23505' && c.constraint === 'identity_checks_nin') throw new IdentityError('nin_in_use', 'This ID number is already used by another account. Call SAZO if this is wrong.');
      if (c.code === '23505') throw new IdentityError('already_sent', 'You have already sent your ID');
      throw err;
    }
  }

  private async byId(id: string): Promise<IdentityCheckView | undefined> {
    const r = (await this.pool.query<{ id: string; status: IdentityCheckView['status']; decision_reason: string | null; decided_at: Date | null; created_at: Date }>(
      `SELECT id, status, decision_reason, decided_at, created_at FROM iam.identity_checks WHERE id = $1`, [id])).rows[0];
    return r && { checkId: r.id, status: r.status, decisionReason: r.decision_reason, decidedAt: r.decided_at?.toISOString() ?? null, createdAt: r.created_at.toISOString() };
  }

  /** The person's latest check, if any. */
  async mine(userId: string): Promise<IdentityCheckView | undefined> {
    const r = (await this.pool.query<{ id: string }>(`SELECT id FROM iam.identity_checks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId])).rows[0];
    return r ? this.byId(r.id) : undefined;
  }

  /** Status of each user's current check: approved, pending, or missing (none, or only rejected ones). */
  async statusOf(userIds: string[], sql: Sql = this.pool): Promise<Map<string, 'approved' | 'pending' | 'missing'>> {
    const out = new Map<string, 'approved' | 'pending' | 'missing'>(userIds.map((u) => [u, 'missing']));
    if (!userIds.length) return out;
    const { rows } = await sql.query<{ user_id: string; status: 'approved' | 'pending' }>(
      `SELECT user_id, status FROM iam.identity_checks WHERE user_id = ANY($1) AND status IN ('pending','approved')`, [userIds]);
    for (const r of rows) out.set(r.user_id, r.status);
    return out;
  }

  /**
   * At business approval: every active manager must have sent their ID; their pending checks are approved in
   * the same transaction as the business. Throws `manager_identity_missing` naming who has not sent it.
   */
  async approveManagersInTx(tx: Sql, actor: Actor, organisationId: string, reason: string): Promise<void> {
    const { rows } = await tx.query<{ user_id: string; name: string }>(
      `SELECT u.id AS user_id, u.display_name AS name FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id JOIN iam.roles r ON r.id = m.role_id
        WHERE m.organisation_id = $1 AND m.status = 'active' AND r.code = 'org_manager'`, [organisationId]);
    const status = await this.statusOf(rows.map((r) => r.user_id), tx);
    const missing = rows.filter((r) => status.get(r.user_id) === 'missing');
    if (missing.length) {
      throw new IdentityError('manager_identity_missing', `${missing.map((m) => m.name).join(', ')} ${missing.length === 1 ? 'has' : 'have'} not sent a National ID yet. Ask them to send it from the business page, then approve.`);
    }
    const pending = rows.filter((r) => status.get(r.user_id) === 'pending').map((r) => r.user_id);
    if (!pending.length) return;
    await tx.query(`UPDATE iam.identity_checks SET status = 'approved', decision_reason = $2, decided_by_user_id = $3, decided_at = now()
                     WHERE user_id = ANY($1) AND status = 'pending'`, [pending, `Checked with the business: ${reason}`.slice(0, 500), actor.userId]);
    for (const u of pending) {
      await this.repo.audit(tx, { actorUserId: actor.userId, organisationId, action: 'identity.approved', targetType: 'user', targetId: u, details: { withBusiness: organisationId } });
    }
  }

  /** For SAZO admins: checks with the person's name, phone, businesses and NIN (decrypted for this check only). */
  async list(status: 'pending' | 'approved' | 'rejected', userIds?: string[]) {
    const { rows } = await this.pool.query<{ id: string; user_id: string; nin_ciphertext: Buffer; nin_key_version: number; id_photo_evidence_id: string; status: string;
      decision_reason: string | null; created_at: Date }>(
      `SELECT id, user_id, nin_ciphertext, nin_key_version, id_photo_evidence_id, status, decision_reason, created_at FROM iam.identity_checks
        WHERE status = $1 AND ($2::uuid[] IS NULL OR user_id = ANY($2)) ORDER BY created_at LIMIT 200`, [status, userIds ?? null]);
    return Promise.all(rows.map(async (r) => {
      const u = await this.repo.userById(r.user_id);
      const orgs = (await this.repo.memberships(r.user_id)).filter((m) => m.status === 'active' && m.role === 'org_manager');
      return {
        checkId: r.id, userId: r.user_id, status: r.status, decisionReason: r.decision_reason, createdAt: r.created_at.toISOString(), idPhotoEvidenceId: r.id_photo_evidence_id,
        person: { name: [u?.surname, u?.firstName, u?.middleName].filter(Boolean).join(' ') || u?.displayName || null, phone: u?.phone ?? null, gender: u?.gender ?? null },
        businesses: orgs.map((o) => ({ organisationId: o.organisationId, name: o.organisationName, type: o.organisationType, status: o.organisationStatus })),
        nin: this.keyring.decrypt(r.nin_ciphertext, r.nin_key_version),
      };
    }));
  }

  /** Approve or reject one check (a manager added to an approved business, or a rejection), with a reason. */
  async decide(actor: Actor, id: string, decision: 'approve' | 'reject', reason: string): Promise<IdentityCheckView> {
    await withTx(this.pool, async (tx) => {
      const { rows } = await tx.query<{ user_id: string; status: string }>(`SELECT user_id, status FROM iam.identity_checks WHERE id = $1 FOR UPDATE`, [id]);
      if (!rows[0]) throw new IdentityError('check_not_found', 'No such check');
      if (rows[0].status !== 'pending') throw new IdentityError('already_decided', 'This check has already been decided');
      await tx.query(`UPDATE iam.identity_checks SET status = $2, decision_reason = $3, decided_by_user_id = $4, decided_at = now() WHERE id = $1`,
        [id, decision === 'approve' ? 'approved' : 'rejected', reason, actor.userId]);
      await this.repo.audit(tx, { actorUserId: actor.userId, action: `identity.${decision === 'approve' ? 'approved' : 'rejected'}`, targetType: 'user', targetId: rows[0].user_id,
        details: { checkId: id, reason } });
    });
    return (await this.byId(id))!;
  }

  /** The user a check belongs to (to tell them the decision). */
  async owner(id: string): Promise<string | undefined> {
    return (await this.pool.query<{ user_id: string }>(`SELECT user_id FROM iam.identity_checks WHERE id = $1`, [id])).rows[0]?.user_id;
  }
}
