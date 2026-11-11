import { describe, expect, it } from 'vitest';
import { accessOf, homeFor } from './access';

const m = (organisationId: string, organisationType: string, organisationStatus: string, status = 'active', role = 'org_manager') =>
  ({ organisationId, organisationName: organisationId, organisationType, organisationStatus, role, status });
const home = (platformRoles: string[], memberships: ReturnType<typeof m>[] = []) => homeFor(accessOf({ platformRoles, memberships }));

describe('where a person lands after logging in (D-172)', () => {
  it('sends each role to its own workspace', () => {
    expect(home(['sazo_reviewer'])).toBe('/admin');
    expect(home([], [m('d1', 'dealer', 'approved')])).toBe('/dealer/d1/dashboard');
    expect(home(['broker'])).toBe('/broker');
    expect(home([], [m('d2', 'dealer', 'pending_verification')])).toBe('/dealer/d2');
    expect(home([], [m('g1', 'garage', 'approved', 'active', 'mechanic')])).toBe('/business/g1');
    expect(home([], [m('i1', 'inspection_centre', 'approved')])).toBe('/business/i1');
    expect(home([])).toBe('/');
  });
  it('picks one when a person has several roles: staff, approved dealer, broker, waiting dealer, workshop', () => {
    expect(home(['broker', 'sazo_admin'], [m('d1', 'dealer', 'approved')])).toBe('/admin');
    expect(home(['broker'], [m('d1', 'dealer', 'approved')])).toBe('/dealer/d1/dashboard');
    expect(home(['broker'], [m('d2', 'dealer', 'pending_verification'), m('g1', 'garage', 'approved')])).toBe('/broker');
  });
  it('ignores businesses that were rejected or suspended, and memberships that ended', () => {
    expect(home([], [m('d1', 'dealer', 'suspended'), m('d3', 'dealer', 'rejected')])).toBe('/');
    expect(home([], [m('d1', 'dealer', 'approved', 'removed')])).toBe('/');
    expect(home(['broker'], [m('d1', 'dealer', 'suspended')])).toBe('/broker');
  });
});
