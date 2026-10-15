// Identity & Access — public interface used by other modules and by scripts.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { personInitials } from '@sazo/contracts';
import { PII_KEYRING, type Keyring } from '../../platform/keyring.js';
import { enforceLimit } from '../../platform/limits.js';
import { withTx, type Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { NotificationsService } from '../notify/index.js';
import type { Actor } from './actor.js';
import { IamRepository, type OrganisationRow } from './iam.repository.js';

/** Limits agreed in the security review (S5). */
export const ORG_SIGNUPS_PER_DAY = 3;
export const STAFF_INVITES_PER_MINUTE = 3;

export const BUSINESS_ORG_TYPES = ['garage', 'dealer', 'inspector', 'inspection_centre', 'lender', 'insurer', 'auction', 'rental', 'importer'] as const;

@Injectable()
export class IamService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamRepository) private readonly repo: IamRepository,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
    @Inject(PII_KEYRING) private readonly keyring: Keyring,
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
      await enforceLimit(tx, `org-signup:${actor.userId}`, ORG_SIGNUPS_PER_DAY,
        `SELECT count(*)::int AS n FROM iam.audit_entries WHERE actor_user_id = $1 AND action = 'organisation.registered' AND at > now() - interval '1 day'`,
        [actor.userId], `You can register up to ${ORG_SIGNUPS_PER_DAY} businesses a day. Try again tomorrow or call SAZO.`);
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

  approvedCounts(): Promise<Record<string, number>> {
    return this.repo.approvedCounts();
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

  /** The verified phone a user signs in with (used to match the registry's owner record, O-007). */
  async userPhone(userId: string): Promise<string | undefined> {
    return (await this.repo.userById(userId))?.phone ?? undefined;
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

  firstNames(userIds: string[]): Promise<Map<string, string>> {
    return this.repo.firstNames([...new Set(userIds)]);
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
      // Each invitation sends a text, so a business can add only a few people a minute (S5).
      await enforceLimit(tx, `staff-invite:${organisationId}`, STAFF_INVITES_PER_MINUTE,
        `SELECT count(*)::int AS n FROM iam.audit_entries WHERE acting_for_organisation_id = $1 AND action = 'membership.added' AND at > now() - interval '1 minute'`,
        [organisationId], `You can add up to ${STAFF_INVITES_PER_MINUTE} people a minute. Wait a minute and try again.`);
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

  // ---------- account settings
  /** The account using this phone number, if any (deleted accounts excluded). */
  async userIdByPhone(phone: string): Promise<string | undefined> {
    const u = await this.repo.userByPhone(phone);
    return u && u.status !== 'deleted' ? u.id : undefined;
  }

  async devices(userId: string, currentSessionId: string) {
    return (await this.repo.sessions(userId)).map((s) => ({
      sessionId: s.id, device: s.userAgent, signedInAt: s.createdAt.toISOString(), lastUsedAt: s.lastUsedAt.toISOString(), current: s.id === currentSessionId,
    }));
  }

  signOutDevice(userId: string, sessionId: string) {
    return this.repo.revokeUserSession(userId, sessionId, 'signed_out_by_user');
  }

  signOutOthers(userId: string, currentSessionId: string) {
    return this.repo.revokeAllSessions(userId, 'signed_out_by_user', currentSessionId);
  }

  soleManagerOf(userId: string) {
    return this.repo.soleManagerOf(userId);
  }

  /**
   * The person's own details for Settings, with the profile progress bar (D-102): basic details (names,
   * gender, date of birth) + confirmed phone + confirmed email + password. `needsDetails` lists what an older
   * account must still give before using SAZO.
   */
  async profile(userId: string) {
    const [u, orgs, identities] = await Promise.all([this.repo.userById(userId), this.repo.myOrganisations(userId), this.repo.identities(userId)]);
    const details = await Promise.all(orgs.map((o: { id: string }) => this.repo.organisation(o.id)));
    const needsDetails = !u ? [] : [
      ...(!u.surname ? ['surname'] : []), ...(!u.firstName ? ['firstName'] : []), ...(!u.gender ? ['gender'] : []), ...(!u.dobCiphertext ? ['dateOfBirth'] : []),
    ];
    const items = [
      { key: 'details', label: 'Your details', done: needsDetails.length === 0 },
      { key: 'phone', label: 'Confirmed phone number', done: !!u?.phone },
      { key: 'email', label: 'Confirmed email', done: !!u?.emailVerified },
      { key: 'password', label: 'Password', done: identities.includes('password') },
    ];
    return {
      displayName: u?.displayName, initials: personInitials(u ?? {}),
      surname: u?.surname ?? null, firstName: u?.firstName ?? null, middleName: u?.middleName ?? null,
      gender: u?.gender ?? null, dateOfBirth: u?.dobCiphertext ? this.keyring.decrypt(u.dobCiphertext, u.dobKeyVersion!) : null,
      phone: u?.phone, email: u?.email ?? null, emailVerified: !!u?.emailVerified,
      hasPassword: identities.includes('password'), hasGoogle: identities.includes('google'),
      needsDetails,
      progress: { percent: Math.round((100 * items.filter((i) => i.done).length) / items.length), items },
      businesses: orgs.map((o: { id: string; type: string; legalName: string; tradingName: string | null; status: string; role: string; documents: number }, i: number) => ({
        name: o.tradingName ?? o.legalName, legalName: o.legalName, tradingName: o.tradingName, type: o.type, yourRole: o.role, status: o.status,
        registrationNumber: details[i]?.registrationNumber ?? null, district: details[i]?.district ?? null,
        registeredAt: details[i]?.createdAt ?? null, documentsSent: Number(o.documents),
      })),
    };
  }

  async anonymise(actor: Actor): Promise<void> {
    await this.audit({ actor, action: 'account.delete', targetType: 'user', targetId: actor.userId });
    await this.repo.anonymise(actor.userId);
  }
}
