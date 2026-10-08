import Link from 'next/link';
import type { Conflict } from '@/lib/types';
import { adminFetch, requireStaff } from '../guard';
import { CHECK, CONFLICT_STATUS, TOPIC, day } from '../labels';
import { Forbidden, Notice, type SP } from '../notice';

export default async function Conflicts({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/conflicts');
  const sp = await searchParams;
  const qs = new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.topic ? { topic: sp.topic } : {}) });
  const data = await adminFetch<{ items: Conflict[] }>(`/admin/conflicts?${qs}`);
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Conflicts</h1>
      <p className="mb-4 text-muted">Records that disagree. Records are never edited: you resolve the conflict with your reasoning, and may mark which record is wrong.</p>
      <Notice done={sp.done} error={sp.error} />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <div><label htmlFor="status" className="label">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ''} className="field !w-auto">
            <option value="">Open and in review</option>
            {Object.entries(CONFLICT_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label htmlFor="topic" className="label">Topic</label>
          <select id="topic" name="topic" defaultValue={sp.topic ?? ''} className="field !w-auto">
            <option value="">All</option>
            {Object.entries(TOPIC).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <button className="btn btn-ghost">Show</button>
      </form>
      {data === 'forbidden' ? <Forbidden what="the conflict queue" /> : data.items.length === 0 ? <p className="text-muted">No conflicts here.</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-label">
              <tr><th className="p-3">Vehicle</th><th className="p-3">Topic</th><th className="p-3">Why it opened</th><th className="p-3">Status</th><th className="p-3">Opened</th><th className="p-3"><span className="sr-only">Open</span></th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((c) => (
                <tr key={c.conflictId}>
                  <td className="p-3"><span className="sazo-id font-semibold">{c.vehicleRef}</span>{c.relatedVehicleRefs.length > 0 && <span className="block text-xs text-muted">also {c.relatedVehicleRefs.join(', ')}</span>}</td>
                  <td className="p-3">{TOPIC[c.topic] ?? c.topic}</td>
                  <td className="p-3">{c.openedByCheck ? CHECK[c.openedByCheck] ?? c.openedByCheck : '—'}</td>
                  <td className="p-3">{CONFLICT_STATUS[c.status] ?? c.status}</td>
                  <td className="p-3 whitespace-nowrap">{day(c.openedAt)}</td>
                  <td className="p-3"><Link className="link" href={`/admin/conflicts/${c.conflictId}`}>Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
