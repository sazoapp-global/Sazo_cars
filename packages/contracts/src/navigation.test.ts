import { describe, expect, it } from 'vitest';
import { activeKey, isGroup, navFor, workspaceOf } from './navigation.js';

const keys = (entries: ReturnType<typeof navFor>) => entries.flatMap((e) => (isGroup(e) ? [e.key, ...e.links.map((l) => l.key)] : [e.key]));

describe('navigation (one list of workspaces and modules)', () => {
  it('shows a dealer salesperson fewer modules than a manager, with the business filled in', () => {
    const sales = navFor('dealer', { platformRoles: ['consumer'], orgRole: 'org_staff' }, 'abc');
    expect(keys(sales)).toEqual(['stock', 'notifications', 'enquiries', 'sold', 'business']);
    const manager = navFor('dealer', { platformRoles: ['consumer'], orgRole: 'org_manager' }, 'abc');
    expect(keys(manager)).toContain('commissions');
    expect(manager.find((e) => e.key === 'sold')).toMatchObject({ href: '/dealer/abc?show=sold' });
  });

  it('a dealer waiting for approval sees only what stays private: stock, settings and the approval steps', () => {
    const waiting = navFor('dealer', { platformRoles: ['consumer'], orgRole: 'org_manager', approved: false }, 'abc');
    expect(keys(waiting)).toEqual(['stock', 'notifications', 'business-settings', 'business']);
  });

  it('the garage app: managers see Team, mechanics do not; inspectors get the inspection workspace', () => {
    expect(keys(navFor('garage', { platformRoles: [], orgRole: 'org_manager' }))).toEqual(['home', 'notifications', 'records', 'alerts', 'concerns', 'team']);
    expect(keys(navFor('garage', { platformRoles: [], orgRole: 'org_staff' }))).not.toContain('team');
    const nav = navFor('garage', { platformRoles: [], orgRole: 'org_staff' });
    expect(activeKey(nav, '#/jobs/123', new URLSearchParams())).toBe('records');
    expect(activeKey(nav, '#/', new URLSearchParams())).toBe('home');
    expect(activeKey(navFor('inspect', { platformRoles: [], orgRole: 'org_staff' }), '#/inspection/9', new URLSearchParams())).toBe('home');
  });

  it('hides admin-only modules from reviewers and drops nothing else', () => {
    const reviewer = keys(navFor('console', { platformRoles: ['sazo_reviewer'] }));
    expect(reviewer).not.toContain('people');
    expect(reviewer).toContain('faqs');
    expect(keys(navFor('console', { platformRoles: ['sazo_admin'] }))).toContain('people');
    expect(navFor('console', { platformRoles: ['consumer'] })).toEqual([]);
  });

  it('marks the page you are on', () => {
    const nav = navFor('dealer', { platformRoles: [], orgRole: 'org_manager' }, 'abc');
    expect(activeKey(nav, '/dealer/abc', new URLSearchParams())).toBe('stock');
    expect(activeKey(nav, '/dealer/abc', new URLSearchParams('show=sold'))).toBe('sold');
    expect(activeKey(nav, '/dealer/abc/car/123', new URLSearchParams())).toBe('stock');
    expect(activeKey(nav, '/dealer/abc/enquiries', new URLSearchParams())).toBe('enquiries');
    expect(activeKey(nav, '/dealer/abc/enquiries', new URLSearchParams('panel=notifications'))).toBe('notifications');
    expect(workspaceOf('/dealer/abc/import')?.label).toBe('Dealer');
    expect(workspaceOf('/admin/faqs')?.label).toBe('SAZO console');
    expect(workspaceOf('/administrator')).toBeUndefined();
  });
});
