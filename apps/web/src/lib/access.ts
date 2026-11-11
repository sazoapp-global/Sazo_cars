// Who may use which workspace, and where each person lands after logging in (D-172, 11 Nov 2026).
//
// The API is the authority: every request reloads the person's roles and permissions from the database, and
// each action checks its permission (broker.access, a role in the business, SAZO staff) again. These rules only
// decide which screens to show, so nobody has to look for their page and nobody sees a workspace they cannot use.
//
// How a role is granted, always after a check by SAZO:
//   SAZO staff         an administrator gives the sazo_admin or sazo_reviewer role
//   Broker             SAZO approves the National ID application, which gives the broker role
//   Dealer, garage,    SAZO approves the business; its manager adds staff, each with a role in that business
//   inspection centre  (a dealer waiting for approval may prepare stock privately, D-161)
import type { Me } from './types';

export type Workplace = { id: string; type: string; status: string; role: string };

export interface Access {
  staff: boolean;
  broker: boolean;
  /** Businesses the person works in now: an active membership of a business that is not rejected or suspended. */
  workplaces: Workplace[];
}

const STAFF_ROLES = ['sazo_admin', 'sazo_reviewer'];
const CLOSED = ['rejected', 'suspended'];

export function accessOf(me: Pick<Me, 'platformRoles' | 'memberships'>): Access {
  return {
    staff: me.platformRoles.some((r) => STAFF_ROLES.includes(r)),
    broker: me.platformRoles.includes('broker'),
    workplaces: me.memberships
      .filter((m) => m.status === 'active' && !CLOSED.includes(m.organisationStatus))
      .map((m) => ({ id: m.organisationId, type: m.organisationType, status: m.organisationStatus, role: m.role })),
  };
}

/**
 * Where a person lands after logging in when they did not ask for a particular page. One workspace is
 * chosen, in this order; the others stay one click away in My SAZO.
 *   1. SAZO staff                      the SAZO console
 *   2. an approved dealer              its dashboard
 *   3. a broker                        the broker's own pages
 *   4. a dealer waiting for approval   its cars for sale (prepared privately until approval)
 *   5. a garage or inspection centre   its page, with the way into the SAZO Garage app
 *   6. everyone else (buyers, owners)  the home page
 */
export function homeFor(a: Access): string {
  if (a.staff) return '/admin';
  const dealer = (status: string) => a.workplaces.find((w) => w.type === 'dealer' && w.status === status);
  const approved = dealer('approved');
  if (approved) return `/dealer/${approved.id}/dashboard`;
  if (a.broker) return '/broker';
  const waiting = dealer('pending_verification');
  if (waiting) return `/dealer/${waiting.id}`;
  const workshop = a.workplaces.find((w) => ['garage', 'inspector', 'inspection_centre'].includes(w.type));
  if (workshop) return `/business/${workshop.id}`;
  return '/';
}
