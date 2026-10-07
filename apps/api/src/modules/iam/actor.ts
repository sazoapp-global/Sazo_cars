// Who is making a request, and what they may do (API Outline §3).
import type { MembershipRow } from './iam.repository.js';

export interface Actor {
  userId: string;
  sessionId: string;
  displayName: string;
  platformRoles: string[];
  /** Permissions from platform roles (e.g. consumer, sazo_admin). */
  permissions: Set<string>;
  memberships: MembershipRow[];
}

/** Platform-level permission check. */
export const can = (actor: Actor | undefined, permission: string): boolean => !!actor?.permissions.has(permission);

export type OrgAccess =
  | { ok: true; membership: MembershipRow | null }
  | { ok: false; code: 'not_a_member' | 'organisation_not_approved' | 'forbidden' };

/**
 * Can the actor do `permission` on behalf of `organisationId`? SAZO admins can (platform permission);
 * otherwise an ACTIVE membership in an APPROVED organisation whose role grants it (D-055, D-056).
 */
export function canForOrg(actor: Actor | undefined, organisationId: string, permission: string): OrgAccess {
  if (!actor) return { ok: false, code: 'forbidden' };
  if (actor.permissions.has(permission)) return { ok: true, membership: null };
  const m = actor.memberships.find((x) => x.organisationId === organisationId && x.status === 'active');
  if (!m) return { ok: false, code: 'not_a_member' };
  if (m.organisationStatus !== 'approved') return { ok: false, code: 'organisation_not_approved' };
  if (!m.permissions.includes(permission)) return { ok: false, code: 'forbidden' };
  return { ok: true, membership: m };
}
