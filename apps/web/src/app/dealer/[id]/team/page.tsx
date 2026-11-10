import { Flash } from '@/components/flash';
// Team (4 Nov 2026): who works at the dealer and adding someone, on its own page under Team in the side bar
// (it used to sit under the cars on Cars for sale). Managers of an approved business only.
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { Icon } from '@/components/icon';
import { Pager, pageHref, paginate } from '@/components/pager';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation, StaffMember } from '@/lib/types';
import { addStaff } from '../../actions';

export const metadata: Metadata = { title: 'Team', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string; page?: string }>;

export default async function DealerTeam({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/team`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status !== 'approved' || org.role !== 'org_manager') redirect(`/dealer/${id}`);
  const name = org.tradingName ?? org.legalName;
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const [staff, me] = await Promise.all([
    api<StaffMember[]>('/garage/staff', as).catch((err) => { if (err instanceof ApiError) return [] as StaffMember[]; throw err; }),
    api<Me>('/me', { auth: true }).catch(() => undefined),
  ]);
  const paged = paginate(staff, sp.page);

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved: true }} business={{ name, approved: true }}
      person={me ? { name: me.displayName, role: 'Manager' } : undefined} badges={{ team: staff.length }}>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name}: team</h1>
        <p className="mt-1 max-w-2xl text-muted">The people who work with your cars. Each one signs in with their own phone number.</p>
      </div>
      {sp.done && <Flash className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</Flash>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      <section id="staff-section" className="rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="staff">
        <h2 id="staff" className="font-display text-lg font-bold">Your team</h2>
        {staff.length === 0 ? <p className="mt-2 text-muted">Nobody added yet.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {paged.items.map((m) => <li key={m.userId} className="flex justify-between gap-3 py-2"><span>{m.displayName}</span><span className="text-sm text-muted">{m.role === 'org_manager' ? 'Manager' : 'Sales'}</span></li>)}
          </ul>
        )}
        <Pager paged={paged} href={pageHref(`/dealer/${id}/team`, {})} noun="people" label="Pages of your team" />
        <form action={addStaff} data-draft={`dealer-staff-${id}`} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <input type="hidden" name="org" value={id} />
          <div><label htmlFor="sname" className="label">Name</label><input id="sname" name="name" required className="field" /></div>
          <div><label htmlFor="sphone" className="label">Phone</label><input id="sphone" name="phone" type="tel" required className="field" placeholder="0772 123 456" /></div>
          <div><label htmlFor="srole" className="label">Role</label><select id="srole" name="role" className="field"><option value="org_staff">Sales</option><option value="org_manager">Manager</option></select></div>
          <button className="btn btn-ghost"><Icon name="add" />Add</button>
        </form>
      </section>
    </AppFrame>
  );
}
