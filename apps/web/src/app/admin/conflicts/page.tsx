import { Pager, pageHref, paginate } from '@/components/pager';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import type { Conflict } from '@/lib/types';
import { adminFetch, requireStaff } from '../guard';
import { CHECK, CONFLICT_STATUS, TOPIC, day } from '../labels';
import { Forbidden, Notice, type SP } from '../notice';

/**
 * The tabs and chips (15 Nov 2026): status as tabs, topic as chips, each a link that shows the list at once (no
 * Show button). "Needs action" is the open ones and those being reviewed, with how many are waiting.
 */
const TABS: [string, string][] = [['', 'Needs action'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['auto_resolved', 'Closed by itself'], ['all', 'All']];
const STATUS_TONE: Record<string, string> = {
  open: 'bg-warn-fill text-warn-text', under_review: 'bg-soft text-primary-container', resolved: 'bg-ok-fill text-ok-text',
  auto_resolved: 'bg-soft text-muted', dismissed: 'bg-soft text-muted',
};

export default async function Conflicts({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/conflicts');
  const sp = await searchParams;
  const status = sp.status ?? '';
  const topic = sp.topic ?? '';
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(topic ? { topic } : {}) });
  const [data, waiting] = await Promise.all([
    adminFetch<{ items: Conflict[] }>(`/admin/conflicts?${qs}`),
    // How many need action, for the first tab's count, whichever tab is open.
    status ? adminFetch<{ items: Conflict[] }>(`/admin/conflicts?limit=200${topic ? `&topic=${topic}` : ''}`) : undefined,
  ]);
  const href = (s: string, t: string) => `/admin/conflicts${s || t ? `?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(t ? { topic: t } : {}) })}` : ''}`;
  const needing = waiting && waiting !== 'forbidden' ? waiting.items.length : data !== 'forbidden' && !status ? data.items.length : null;
  const why = (c: Conflict) => (c.openedByCheck ? CHECK[c.openedByCheck] ?? c.openedByCheck : 'Not recorded');
  const review = (c: Conflict, wide = false) => (
    <Link className={`btn btn-ghost min-h-9 whitespace-nowrap px-3.5 py-1.5 text-sm ${wide ? 'w-full justify-center' : ''}`} href={`/admin/conflicts/${c.conflictId}`}
      aria-label={`Review ${c.vehicleRef}`}>Review<Icon name="arrow_forward" size={18} /></Link>
  );
  const pill = (c: Conflict) => <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[c.status] ?? 'bg-soft text-muted'}`}>{CONFLICT_STATUS[c.status] ?? c.status}</span>;
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Conflicts</h1>
      <p className="mb-4 text-muted">Records that disagree. Records are never edited: you resolve the conflict with your reasoning, and may mark which record is wrong.</p>
      <Notice done={sp.done} error={sp.error} />
      <nav aria-label="Status" className="flex overflow-x-auto border-b border-line">
        {TABS.map(([v, l]) => {
          const on = status === v;
          return (
            <Link key={l} href={href(v, topic)} aria-current={on ? 'page' : undefined}
              className={`mr-5 shrink-0 whitespace-nowrap border-b-[3px] px-1 py-2.5 ${on ? 'border-primary-container font-extrabold text-primary-container' : 'border-transparent font-semibold text-muted hover:text-ink'}`}>
              {l}
              {v === '' && needing !== null && <span className={`ml-1.5 rounded-full px-2 py-px text-xs ${on ? 'bg-primary-container text-white' : 'bg-soft text-muted'}`}>{needing}</span>}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Topic" className="mb-4 mt-3 flex items-center gap-2 overflow-x-auto pb-0.5">
        <span className="mr-1 shrink-0 text-xs font-extrabold uppercase tracking-wider text-label">Topic</span>
        {[['', 'All'] as [string, string], ...Object.entries(TOPIC)].map(([v, l]) => {
          const on = topic === v;
          return (
            <Link key={l} href={href(status, v)} aria-current={on ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${on ? 'bg-primary-container text-white' : 'border border-line bg-card text-ink hover:bg-soft'}`}>{l}</Link>
          );
        })}
      </nav>
      {data === 'forbidden' ? <Forbidden what="the conflict queue" /> : data.items.length === 0 ? <p className="text-muted">No conflicts here.</p> : (
        <>
          {/* A laptop or tablet: the table. */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-wider text-label">
                <tr><th className="p-3">Vehicle</th><th className="p-3">Topic</th><th className="p-3">Why it opened</th><th className="p-3">Status</th><th className="p-3">Opened</th><th className="p-3"><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paginate(data.items, sp.page).items.map((c) => (
                  <tr key={c.conflictId}>
                    <td className="p-3"><span className="sazo-id font-semibold">{c.vehicleRef}</span>{c.relatedVehicleRefs.length > 0 && <span className="block text-xs text-muted">also {c.relatedVehicleRefs.join(', ')}</span>}</td>
                    <td className="p-3">{TOPIC[c.topic] ?? c.topic}</td>
                    <td className="p-3">{why(c)}</td>
                    <td className="p-3">{CONFLICT_STATUS[c.status] ?? c.status}</td>
                    <td className="p-3 whitespace-nowrap">{day(c.openedAt)}</td>
                    <td className="p-3 text-right">{review(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* A phone: one card per conflict. */}
          <ul className="grid gap-2.5 md:hidden" aria-label="Conflicts">
            {paginate(data.items, sp.page).items.map((c) => (
              <li key={c.conflictId} className="rounded-xl border border-line bg-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><span className="sazo-id font-semibold">{c.vehicleRef}</span>
                    {c.relatedVehicleRefs.length > 0 && <span className="block text-xs text-muted">also {c.relatedVehicleRefs.join(', ')}</span>}</div>
                  {pill(c)}
                </div>
                <p className="mt-1.5 font-semibold">{why(c)}</p>
                <p className="text-sm text-muted">{TOPIC[c.topic] ?? c.topic} · opened {day(c.openedAt)}</p>
                <div className="mt-2.5">{review(c, true)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {data !== 'forbidden' && (
        <Pager paged={paginate(data.items, sp.page)} href={pageHref('/admin/conflicts', { status: sp.status, topic: sp.topic })} noun="conflicts" />
      )}
    </>
  );
}
