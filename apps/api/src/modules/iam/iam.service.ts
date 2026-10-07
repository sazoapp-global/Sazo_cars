// Identity & Access — public interface used by other modules and by scripts.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { withTx, type Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import type { Actor } from './actor.js';
import { IamRepository, type OrganisationRow } from './iam.repository.js';

export const BUSINESS_ORG_TYPES = ['garage', 'dealer', 'inspector', 'inspection_centre', 'lender', 'insurer', 'auction', 'rental', 'importer'] as const;

@Injectable()
export class IamService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamRepository) private readonly repo: IamRepository,
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
    return this.repo.organisation(id);
  }
}
