// Broker identity check (D-127): a person with a full profile sends their National ID number and a photo of
// their ID; a SAZO admin checks it and approves or rejects with a reason. Approval gives the platform role
// "broker". The ID number is encrypted like other personal data and matched by keyed hash, so one ID number
// cannot back two broker accounts.
import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { PII_KEYRING, type Keyring } from '../../platform/keyring.js';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import type { Actor } from './actor.js';
import { IamRepository } from './iam.repository.js';
import { IamService } from './iam.service.js';

export class BrokerApplicationError extends Error {
  constructor(readonly code: 'profile_incomplete' | 'already_applied' | 'nin_in_use' | 'application_not_found' | 'already_decided', message: string) {
    super(message);
  }
}

export interface BrokerApplicationView {
  applicationId: string; userId: string; status: 'pending' | 'approved' | 'rejected'; decisionReason: string | null; decidedAt: string | null; createdAt: string;
  idPhotoEvidenceId: string;
}

@Injectable()
export class BrokersService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamRepository) private readonly repo: IamRepository,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(PII_KEYRING) private readonly keyring: Keyring,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private ninHash(nin: string): Buffer {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(`nin:${nin}`).digest();
  }

  /** Apply to become a broker. The caller has already checked the ID photo is the applicant's own upload. */
  async apply(actor: Actor, nin: string, idPhotoEvidenceId: string): Promise<BrokerApplicationView> {
    const profile = await this.iam.profile(actor.userId);
    if (profile.progress.percent < 100) throw new BrokerApplicationError('profile_incomplete', 'Finish your profile first: your details, a confirmed phone and email, and a password');
    try {
      const id = await withTx(this.pool, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO iam.broker_applications (user_id, nin_ciphertext, nin_key_version, nin_hash, id_photo_evidence_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [actor.userId, this.keyring.encrypt(nin), this.keyring.current, this.ninHash(nin), idPhotoEvidenceId]);
        await this.repo.audit(tx, { actorUserId: actor.userId, action: 'broker.applied', targetType: 'user', targetId: actor.userId });
        return rows[0]!.id;
      });
      return (await this.byId(id))!;
    } catch (err) {
      const c = err as { code?: string; constraint?: string };
      if (c.code === '23505' && c.constraint === 'broker_applications_nin') throw new BrokerApplicationError('nin_in_use', 'This ID number is already used by another broker account. Call SAZO if this is wrong.');
      if (c.code === '23505') throw new BrokerApplicationError('already_applied', 'You have already applied');
      throw err;
    }
  }

  private async byId(id: string): Promise<BrokerApplicationView | undefined> {
    return (await this.pool.query<BrokerApplicationView>(
      `SELECT id AS "applicationId", user_id AS "userId", status, decision_reason AS "decisionReason", decided_at AS "decidedAt", created_at AS "createdAt",
              id_photo_evidence_id AS "idPhotoEvidenceId" FROM iam.broker_applications WHERE id = $1`, [id])).rows[0];
  }

  /** The person's latest application, if any. */
  async mine(userId: string): Promise<BrokerApplicationView | undefined> {
    return (await this.pool.query<BrokerApplicationView>(
      `SELECT id AS "applicationId", user_id AS "userId", status, decision_reason AS "decisionReason", decided_at AS "decidedAt", created_at AS "createdAt",
              id_photo_evidence_id AS "idPhotoEvidenceId" FROM iam.broker_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId])).rows[0];
  }

  /** For SAZO admins: applications with the applicant's name, phone and ID number (decrypted for this check only). */
  async list(status: 'pending' | 'approved' | 'rejected') {
    const { rows } = await this.pool.query<{ id: string; user_id: string; nin_ciphertext: Buffer; nin_key_version: number; id_photo_evidence_id: string; status: string;
      decision_reason: string | null; created_at: Date }>(
      `SELECT id, user_id, nin_ciphertext, nin_key_version, id_photo_evidence_id, status, decision_reason, created_at FROM iam.broker_applications
        WHERE status = $1 ORDER BY created_at LIMIT 200`, [status]);
    return Promise.all(rows.map(async (r) => {
      const u = await this.repo.userById(r.user_id);
      return {
        applicationId: r.id, status: r.status, decisionReason: r.decision_reason, createdAt: r.created_at.toISOString(), idPhotoEvidenceId: r.id_photo_evidence_id,
        person: { name: [u?.surname, u?.firstName, u?.middleName].filter(Boolean).join(' ') || u?.displayName || null, phone: u?.phone ?? null, gender: u?.gender ?? null },
        nin: this.keyring.decrypt(r.nin_ciphertext, r.nin_key_version),
      };
    }));
  }

  /** Approve (gives the broker role) or reject, with a reason that is recorded and shown to the applicant. */
  async decide(actor: Actor, id: string, decision: 'approve' | 'reject', reason: string): Promise<BrokerApplicationView> {
    await withTx(this.pool, async (tx) => {
      const { rows } = await tx.query<{ user_id: string; status: string }>(`SELECT user_id, status FROM iam.broker_applications WHERE id = $1 FOR UPDATE`, [id]);
      if (!rows[0]) throw new BrokerApplicationError('application_not_found', 'No such application');
      if (rows[0].status !== 'pending') throw new BrokerApplicationError('already_decided', 'This application has already been decided');
      await tx.query(`UPDATE iam.broker_applications SET status = $2, decision_reason = $3, decided_by_user_id = $4, decided_at = now() WHERE id = $1`,
        [id, decision === 'approve' ? 'approved' : 'rejected', reason, actor.userId]);
      if (decision === 'approve') await this.repo.assignPlatformRole(tx, rows[0].user_id, 'broker');
      await this.repo.audit(tx, { actorUserId: actor.userId, action: `broker.${decision === 'approve' ? 'approved' : 'rejected'}`, targetType: 'user', targetId: rows[0].user_id,
        details: { applicationId: id, reason } });
    });
    return (await this.byId(id))!;
  }

  /** What a buyer sees of a broker on a shared car page: their name and their own phone for WhatsApp. */
  async contact(userId: string): Promise<{ name: string; whatsapp: string | null } | undefined> {
    const u = await this.repo.userById(userId);
    if (!u || u.status !== 'active') return undefined;
    return { name: [u.firstName, u.surname].filter(Boolean).join(' ') || u.displayName, whatsapp: u.phone };
  }
}
