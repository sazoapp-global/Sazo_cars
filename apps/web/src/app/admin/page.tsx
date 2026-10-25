import Link from 'next/link';
import { Icon } from '@/components/icon';
import type { Conflict, Decision, Organisation } from '@/lib/types';
import { adminFetch, requireStaff } from './guard';

/** When a staff decision was made: the time today, otherwise the day. */
const when = (iso: string) => {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'Africa/Kampala' });
  return day(d) === day(new Date())
    ? d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { timeZone: 'Africa/Kampala', day: 'numeric', month: 'short' });
};

/** The console overview (approved 25 Oct 2026): what is waiting first, the empty queues on one line, then recent decisions. */
export default async function AdminHome() {
  const me = await requireStaff('/admin');
  const [orgs, conflicts, matches, concerns, claims, moderation, activity] = await Promise.all([
    adminFetch<{ items: Organisation[] }>('/admin/organisations?status=pending_verification'),
    adminFetch<{ items: Conflict[] }>('/admin/conflicts'),
    adminFetch<{ items: Decision[] }>('/admin/resolutions?outcome=ambiguous'),
    adminFetch<{ items: unknown[] }>('/admin/concerns?status=open'),
    adminFetch<{ items: unknown[] }>('/admin/ownership-claims'),
    adminFetch<{ items: unknown[] }>('/admin/moderation?status=open'),
    adminFetch<{ items: { at: string; actor: string; text: string }[] }>('/admin/activity'),
  ]);
  const queues = [
    { href: '/admin/conflicts', data: conflicts, label: 'Open conflicts', short: 'Conflicts', hint: 'Records that disagree. Settle each with written reasons.' },
    { href: '/admin/organisations', data: orgs, label: 'Businesses waiting for approval', short: 'Businesses', hint: 'They cannot record history until they are approved.' },
    { href: '/admin/concerns', data: concerns, label: 'Reported problems to check', short: 'Reported problems', hint: 'Signs of fraud reported by garages and inspectors.' },
    { href: '/admin/matches', data: matches, label: 'Records waiting for a vehicle match', short: 'Vehicle matches', hint: 'SAZO could not tell which car a record belongs to.' },
    { href: '/admin/moderation', data: moderation, label: 'Reviews and videos to check', short: 'Reviews and videos', hint: 'Nothing people post appears until it is checked.' },
    { href: '/admin/ownership', data: claims, label: 'Logbook photos to check', short: 'Logbook photos', hint: 'People asking to be confirmed as a car’s owner.' },
  ].flatMap((q) => (q.data === 'forbidden' ? [] : [{ ...q, n: q.data.items.length }]));
  const todo = queues.filter((q) => q.n > 0).sort((a, b) => b.n - a.n);
  const clear = queues.filter((q) => q.n === 0);

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-bold md:text-3xl">Good to see you, {me.displayName}</h1>
        <p className="mt-1 text-muted">What needs a person today.</p>
      </div>

      <section aria-labelledby="todo">
        <h2 id="todo" className="mb-3 text-xs font-bold uppercase tracking-wider text-label">To do now</h2>
        {todo.length === 0 ? <p className="card p-5 text-muted">Nothing is waiting. Everything has been checked.</p> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {todo.map((q) => (
              <Link key={q.href} href={q.href} className="card block p-5 hover:border-line-strong">
                <p className="font-display text-4xl font-extrabold text-primary">{q.n.toLocaleString('en-UG')}</p>
                <p className="mt-1 text-lg font-semibold">{q.label}</p>
                <p className="mt-1 text-sm text-muted">{q.hint}</p>
                <p className="mt-3 inline-flex items-center gap-1 font-semibold text-primary-container">Open<Icon name="arrow_forward" size={16} /></p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {clear.length > 0 && (
        <section aria-labelledby="clear">
          <h2 id="clear" className="mb-3 text-xs font-bold uppercase tracking-wider text-label">All clear</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-dashed border-line-strong bg-card px-5 py-3 text-sm text-muted">
            {clear.map((q) => <li key={q.href} className="inline-flex items-center gap-1.5"><Icon name="check" size={16} className="text-ok-text" />{q.short}</li>)}
          </ul>
        </section>
      )}

      {activity !== 'forbidden' && (
        <section aria-labelledby="activity">
          <h2 id="activity" className="mb-3 text-xs font-bold uppercase tracking-wider text-label">Recent activity</h2>
          {activity.items.length === 0 ? <p className="card p-5 text-muted">No decisions yet.</p> : (
            <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card">
              {activity.items.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex items-baseline justify-between gap-3 px-5 py-3 text-sm">
                  <span><strong>{a.actor}</strong> {a.text}</span>
                  <span className="shrink-0 text-muted">{when(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
