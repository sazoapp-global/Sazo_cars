// Identity & Access — public interface used by other modules and by scripts.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { withTx, type Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { NotificationsService } from '../notify/index.js';
import type { Actor } from './actor.js';
import { IamRepository, type OrganisationRow } from './iam.repository.js';

export const BUSINESS_ORG_TYPES = ['garage', 'dealer', 'inspector', 'inspection_centre', 'lender', 'insurer', 'auction', 'rental', 'importer'] as const;

@Injectable()
export class IamService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamRepository) private readonly repo: IamRepository,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
  ) {}

  /** Write an audit entry (append-only). Pass a transaction to audit atomically with the change. */
  audit(e: { actor: Actor | null; organisationId?: string | null; action: string; targetType: string; targetId?: string | null; details?: object }, sql: Sql = this.pool): Promise<void> {
    return this.repo.audit(sql, { actorUserId: e.actor?.userId ?? null, organisationId: e.organisationId, action: e.action, targetType: e.targetType, targetId: e.targetId, details: e.details });
  }

  /** Scripts/tests: find or create a user by phone and give them a platform role. */
  async ensureUser(phone: string, displayName: string, platformRole = 'consumer'): Promise<string> {
    return withTx(this.pool, async (tx) => {
      const existing = await this.repo.userByPhone(phone);
      const id = existing?.id ?? (await this.repo.createUser(tx, displayName, phone));
      await this.repo.assignPlatformRole(tx, id, platformRole);
      return id;
    });
  }

  /** Business sign-up (D-055): the organisation starts pending; the creator becomes its manager. */
  async registerOrganisation(actor: Actor, o: { type: (typeof BUSINESS_ORG_TYPES)[number]; legalName: string; tradingName?: string; registrationNumber?: string; district?: string; contactPhone?: string }): Promise<OrganisationRow> {
    const id = await withTx(this.pool, async (tx) => {
      const orgId = await this.repo.createOrganisation(tx, o);
      await this.repo.addMembership(tx, actor.userId, orgId, 'org_manager', 'active');
      await this.repo.openVerificationCase(tx, orgId);
      await this.repo.audit(tx, { actorUserId: actor.userId, organisationId: orgId, action: 'organisation.registered', targetType: 'organisation', targetId: orgId, details: { type: o.type } });
      return orgId;
    });
    return (await this.repo.organisation(id))!;
  }

  /** Scripts/tests: add a membership directly. */
  async addMember(userId: string, organisationId: string, role: 'org_manager' | 'org_staff' | 'partner_operator'): Promise<void> {
    await this.repo.addMembership(this.pool, userId, organisationId, role, 'active');
  }

  listOrganisations(filter: { status?: string; type?: string }) {
    return this.repo.listOrganisations(filter);
  }

  organisation(id: string) {
    return this.repo.organisation(id);
  }

  async decideOrganisation(actor: Actor, id: string, decision: 'approve' | 'reject' | 'request_info' | 'suspend', reason: string): Promise<OrganisationRow | undefined> {
    await withTx(this.pool, async (tx) => {
      await this.repo.decideOrganisation(tx, id, decision, reason, actor.userId);
      await this.repo.audit(tx, { actorUserId: actor.userId, action: `organisation.${decision}`, targetType: 'organisation', targetId: id, details: { reason } });
    });
    const org = await this.repo.organisation(id);
    // Tell the business's managers by SMS. The reviewer's reason is only included when they must act on it.
    const template = ({ approve: 'org_approved', reject: 'org_rejected', request_info: 'org_info_requested', suspend: 'org_suspended' } as const)[decision];
    for (const m of await this.repo.managerPhones(id)) {
      await this.notify.sendSmsToPhone(m.phone, template, { organisation: org?.tradingName ?? org?.legalName ?? 'Your business', reason: reason.slice(0, 120) }, 'account', m.userId)
        .catch(() => false); // a failed SMS never undoes the decision
    }
    return org;
  }

  myOrganisations(userId: string) {
    return this.repo.myOrganisations(userId);
  }

  verificationDocuments(organisationId: string) {
    return this.repo.verificationDocuments(organisationId);
  }

  /** A manager sends documents (trading licence, photos of the premises) for verification. */
  async addVerificationDocuments(actor: Actor, organisationId: string, evidenceIds: string[]): Promise<boolean> {
    return withTx(this.pool, async (tx) => {
      const ok = await this.repo.addVerificationDocuments(tx, organisationId, evidenceIds);
      if (ok) await this.repo.audit(tx, { actorUserId: actor.userId, organisationId, action: 'organisation.documents_added', targetType: 'organisation', targetId: organisationId, details: { count: evidenceIds.length } });
      return ok;
    });
  }

  /** Active (and invited) members of an organisation — the garage staff list (D-056). */
  listMembers(organisationId: string) {
    return this.repo.members(organisationId);
  }

  async isActiveMember(userId: string, organisationId: string): Promise<boolean> {
    return (await this.repo.members(organisationId)).some((m) => m.userId === userId && m.status === 'active');
  }

  displayNames(userIds: string[]): Promise<Map<string, string>> {
    return this.repo.displayNames([...new Set(userIds)]);
  }

  /**
   * A manager adds a mechanic or receptionist by phone (D-056). The person signs in with a phone code;
   * their membership is active straight away because the manager vouches for them. They get an SMS.
   */
  async addStaff(actor: Actor, organisationId: string, s: { phone: string; displayName: string; role: 'org_staff' | 'org_manager' }) {
    const org = await this.repo.organisation(organisationId);
    const userId = await withTx(this.pool, async (tx) => {
      const existing = await this.repo.userByPhone(s.phone);
      const id = existing?.id ?? (await this.repo.createUser(tx, s.displayName, s.phone));
      if (!existing) await this.repo.assignPlatformRole(tx, id, 'consumer');
      await this.repo.addMembership(tx, id, organisationId, s.role, 'active', actor.userId);
      await this.repo.audit(tx, { actorUserId: actor.userId, organisationId, action: 'membership.added', targetType: 'user', targetId: id, details: { role: s.role } });
      return id;
    });
    await this.notify.sendSmsToPhone(s.phone, 'staff_added', { organisation: org?.tradingName ?? org?.legalName ?? 'a business' }, 'account', userId);
    return (await this.repo.members(organisationId)).find((m) => m.userId === userId)!;
  }
}
