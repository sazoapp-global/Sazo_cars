// Data access for Identity & Access. Owns the `iam` schema.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export type OrgStatus = 'pending_verification' | 'approved' | 'rejected' | 'suspended';

export interface UserRow { id: string; displayName: string; phone: string | null; email: string | null; status: string }
export interface MembershipRow {
  organisationId: string; organisationName: string; organisationType: string; organisationStatus: OrgStatus;
  role: string; status: 'invited' | 'active' | 'removed'; permissions: string[];
}
export interface OrganisationRow {
  id: string; type: string; legalName: string; tradingName: string | null; registrationNumber: string | null;
  district: string | null; status: OrgStatus; createdAt: string;
}

const ORG_COLS = `id, type, legal_name AS "legalName", trading_name AS "tradingName", registration_number AS "registrationNumber",
  district, status, created_at AS "createdAt"`;

@Injectable()
export class IamRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  // ---------- users
  async userByPhone(phone: string): Promise<UserRow | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, display_name AS "displayName", phone_e164 AS phone, email, status FROM iam.users WHERE phone_e164 = $1`, [phone]);
    return rows[0];
  }

  async userById(id: string): Promise<UserRow | undefined> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, display_name AS "displayName", phone_e164 AS phone, email, status FROM iam.users WHERE id = $1`, [id]);
    return rows[0];
  }

  async createUser(sql: Sql, displayName: string, phone: string): Promise<string> {
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO iam.users (display_name, phone_e164) VALUES ($1, $2) RETURNING id`, [displayName, phone]);
    await sql.query(`INSERT INTO iam.auth_identities (user_id, provider, subject, verified_at) VALUES ($1, 'phone_otp', $2, now())`, [rows[0]!.id, phone]);
    return rows[0]!.id;
  }

  async assignPlatformRole(sql: Sql, userId: string, roleCode: string): Promise<void> {
    await sql.query(
      `INSERT INTO iam.platform_role_assignments (user_id, role_id) SELECT $1, id FROM iam.roles WHERE code = $2 AND scope = 'platform'
       ON CONFLICT DO NOTHING`, [userId, roleCode]);
  }

  async platformRolesAndPermissions(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const { rows } = await this.pool.query<{ role: string; perms: string[] }>(
      `SELECT r.code AS role, COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS perms
         FROM iam.platform_role_assignments a JOIN iam.roles r ON r.id = a.role_id
         LEFT JOIN iam.role_permissions rp ON rp.role_id = r.id
        WHERE a.user_id = $1 GROUP BY r.code`, [userId]);
    return { roles: rows.map((r) => r.role), permissions: [...new Set(rows.flatMap((r) => r.perms))] };
  }

  async memberships(userId: string): Promise<MembershipRow[]> {
    const { rows } = await this.pool.query<MembershipRow>(
      `SELECT o.id AS "organisationId", COALESCE(o.trading_name, o.legal_name) AS "organisationName", o.type AS "organisationType",
              o.status AS "organisationStatus", r.code AS role, m.status,
              COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
         FROM iam.memberships m JOIN iam.organisations o ON o.id = m.organisation_id JOIN iam.roles r ON r.id = m.role_id
         LEFT JOIN iam.role_permissions rp ON rp.role_id = r.id
        WHERE m.user_id = $1 AND m.status <> 'removed'
        GROUP BY o.id, r.code, m.status`, [userId]);
    return rows;
  }

  async members(organisationId: string): Promise<{ userId: string; displayName: string; role: string; status: 'invited' | 'active' | 'removed'; joinedAt: string | null }[]> {
    const { rows } = await this.pool.query(
      `SELECT u.id AS "userId", u.display_name AS "displayName", r.code AS role, m.status, m.joined_at AS "joinedAt"
         FROM iam.memberships m JOIN iam.users u ON u.id = m.user_id JOIN iam.roles r ON r.id = m.role_id
        WHERE m.organisation_id = $1 AND m.status <> 'removed' ORDER BY m.created_at`, [organisationId]);
    return rows.map((r) => ({ ...r, joinedAt: r.joinedAt ? new Date(r.joinedAt).toISOString() : null }));
  }

  async displayNames(userIds: string[]): Promise<Map<string, string>> {
    if (!userIds.length) return new Map();
    const { rows } = await this.pool.query<{ id: string; display_name: string }>('SELECT id, display_name FROM iam.users WHERE id = ANY($1)', [userIds]);
    return new Map(rows.map((r) => [r.id, r.display_name]));
  }

  // ---------- one-time codes
  async recentOtpCount(phone: string, minutes: number): Promise<number> {
    const { rows } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM iam.otp_challenges WHERE phone_e164 = $1 AND created_at > now() - make_interval(mins => $2)`, [phone, minutes]);
    return rows[0]!.n;
  }

  async createOtp(phone: string, codeHmac: string, ttlMinutes: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO iam.otp_challenges (phone_e164, code_hmac, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [phone, codeHmac, ttlMinutes]);
  }

  async latestOpenOtp(phone: string): Promise<{ id: string; codeHmac: string; attempts: number } | undefined> {
    const { rows } = await this.pool.query(
      `SELECT id, code_hmac AS "codeHmac", attempts FROM iam.otp_challenges
        WHERE phone_e164 = $1 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [phone]);
    return rows[0];
  }

  async otpAttempt(id: string, success: boolean): Promise<void> {
    await this.pool.query(
      success ? 'UPDATE iam.otp_challenges SET consumed_at = now() WHERE id = $1' : 'UPDATE iam.otp_challenges SET attempts = attempts + 1 WHERE id = $1',
      [id]);
  }

  // ---------- sessions
  async createSession(userId: string, refreshHash: string, ttlDays: number, userAgent?: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO iam.sessions (user_id, refresh_hash, user_agent, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4)) RETURNING id`,
      [userId, refreshHash, userAgent ?? null, ttlDays]);
    return rows[0]!.id;
  }

  async sessionByRefresh(hash: string): Promise<{ id: string; userId: string; revoked: boolean; expired: boolean } | undefined> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id AS "userId", revoked_at IS NOT NULL AS revoked, expires_at <= now() AS expired FROM iam.sessions WHERE refresh_hash = $1`, [hash]);
    return rows[0];
  }

  async sessionByPreviousRefresh(hash: string): Promise<{ id: string } | undefined> {
    const { rows } = await this.pool.query('SELECT id FROM iam.sessions WHERE previous_hash = $1', [hash]);
    return rows[0];
  }

  async rotateSession(id: string, oldHash: string, newHash: string): Promise<void> {
    await this.pool.query('UPDATE iam.sessions SET previous_hash = $2, refresh_hash = $3, rotated_at = now() WHERE id = $1', [id, oldHash, newHash]);
  }

  async revokeSession(id: string, reason: string): Promise<void> {
    await this.pool.query('UPDATE iam.sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL', [id, reason]);
  }

  async sessionActive(id: string, userId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'SELECT 1 FROM iam.sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()', [id, userId]);
    return rows.length > 0;
  }

  // ---------- organisations
  async createOrganisation(sql: Sql, o: { type: string; legalName: string; tradingName?: string | null; registrationNumber?: string | null; district?: string | null; contactPhone?: string | null }): Promise<string> {
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO iam.organisations (type, legal_name, trading_name, registration_number, district, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [o.type, o.legalName, o.tradingName ?? null, o.registrationNumber ?? null, o.district ?? null, o.contactPhone ?? null]);
    return rows[0]!.id;
  }

  async addMembership(sql: Sql, userId: string, organisationId: string, roleCode: string, status: 'invited' | 'active', invitedBy?: string | null): Promise<void> {
    await sql.query(
      `INSERT INTO iam.memberships (user_id, organisation_id, role_id, status, invited_by, joined_at)
       SELECT $1, $2, id, $4, $5, CASE WHEN $4 = 'active' THEN now() END FROM iam.roles WHERE code = $3 AND scope = 'organisation'
       ON CONFLICT (user_id, organisation_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = EXCLUDED.status`,
      [userId, organisationId, roleCode, status, invitedBy ?? null]);
  }

  async openVerificationCase(sql: Sql, organisationId: string): Promise<void> {
    await sql.query(`INSERT INTO iam.verification_cases (organisation_id) VALUES ($1)`, [organisationId]);
  }

  async organisation(id: string): Promise<OrganisationRow | undefined> {
    const { rows } = await this.pool.query<OrganisationRow>(`SELECT ${ORG_COLS} FROM iam.organisations WHERE id = $1`, [id]);
    return rows[0];
  }

  async listOrganisations(filter: { status?: string; type?: string }): Promise<OrganisationRow[]> {
    const { rows } = await this.pool.query<OrganisationRow>(
      `SELECT ${ORG_COLS} FROM iam.organisations WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR type = $2)
        ORDER BY created_at LIMIT 200`, [filter.status ?? null, filter.type ?? null]);
    return rows;
  }

  async decideOrganisation(sql: Sql, id: string, decision: 'approve' | 'reject' | 'request_info' | 'suspend', reason: string, reviewerId: string): Promise<void> {
    const status = { approve: 'approved', reject: 'rejected', suspend: 'suspended', request_info: null }[decision];
    if (status) {
      await sql.query(
        `UPDATE iam.organisations SET status = $2, approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
                suspended_at = CASE WHEN $2 = 'suspended' THEN now() ELSE suspended_at END WHERE id = $1`, [id, status]);
    }
    await sql.query(
      `UPDATE iam.verification_cases SET status = $2, reviewer_user_id = $3, decision_reason = $4, decided_at = now()
        WHERE organisation_id = $1 AND status IN ('open','info_requested')`,
      [id, decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'info_requested', reviewerId, reason]);
  }

  async audit(sql: Sql, e: { actorUserId: string | null; organisationId?: string | null; action: string; targetType: string; targetId?: string | null; details?: object }): Promise<void> {
    await sql.query(
      `INSERT INTO iam.audit_entries (actor_user_id, acting_for_organisation_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5,$6)`,
      [e.actorUserId, e.organisationId ?? null, e.action, e.targetType, e.targetId ?? null, JSON.stringify(e.details ?? {})]);
  }
}
