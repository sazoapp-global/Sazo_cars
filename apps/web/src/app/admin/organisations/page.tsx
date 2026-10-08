import { formatDate } from '@sazo/contracts';
import { api } from '@/lib/api';
import type { Organisation } from '@/lib/types';
import { decideOrganisation } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

const STATUSES = [['pending_verification', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['suspended', 'Suspended']] as const;
const TYPE: Record<string, string> = { garage: 'Garage', dealer: 'Dealer', inspector: 'Inspector', inspection_centre: 'Inspection centre', lender: 'Lender', insurer: 'Insurer', auction: 'Auction', rental: 'Rental', importer: 'Importer' };

export default async function Organisations({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/organisations');
  const sp = await searchParams;
  const status = sp.status ?? 'pending_verification';
  const data = await adminFetch<{ items: Organisation[] }>(`/admin/organisations?status=${status}`);
  const docs = new Map(data === 'forbidden' ? [] : await Promise.all(data.items.map(async (o) =>
    [o.id, (await api<{ evidenceIds: string[] }>(`/admin/organisations/${o.id}/documents`, { auth: true }).catch(() => ({ evidenceIds: [] }))).evidenceIds] as const)));
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Businesses</h1>
      <p className="mb-4 text-muted">Check each business (registration, location, contact person) before it can record vehicle history.</p>
      <Notice done={sp.done} error={sp.error} />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map(([s, label]) => (
          <a key={s} href={`/admin/organisations?status=${s}`} aria-current={s === status ? 'true' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s === status ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-white'}`}>{label}</a>
        ))}
      </nav>
      {data === 'forbidden' ? <Forbidden what="approving businesses" /> : data.items.length === 0 ? <p className="text-muted">Nothing here.</p> : (
        <ul className="space-y-3">
          {data.items.map((o) => (
            <li key={o.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-bold">{o.tradingName ?? o.legalName}</h2>
                <span className="text-sm text-muted">{TYPE[o.type] ?? o.type} · registered {formatDate(o.createdAt)}</span>
              </div>
              <p className="text-sm">{[o.tradingName ? o.legalName : null, o.registrationNumber ? `Reg. no. ${o.registrationNumber}` : 'No registration number given', o.district ?? 'District not given'].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 text-sm">{(docs.get(o.id) ?? []).length === 0 ? <span className="text-warn-text">No documents sent yet.</span> : <>Documents: {(docs.get(o.id) ?? []).map((d, i) => <a key={d} className="link mr-2" href={`/admin/files/${d}`} target="_blank" rel="noreferrer">document {i + 1}</a>)}</>}</p>
              <form action={decideOrganisation} className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
                <input type="hidden" name="id" value={o.id} />
                <div className="flex-1"><label htmlFor={`r-${o.id}`} className="label">Reason (kept in the audit log)</label>
                  <input id={`r-${o.id}`} name="reason" required minLength={3} className="field" placeholder="e.g. Visited the workshop; trading licence checked" /></div>
                <div className="flex flex-wrap gap-2">
                  {o.status !== 'approved' && <button name="decision" value="approve" className="btn btn-primary">Approve</button>}
                  {o.status === 'pending_verification' && <button name="decision" value="request_info" className="btn btn-ghost">Ask for more</button>}
                  {o.status === 'pending_verification' && <button name="decision" value="reject" className="btn btn-ghost">Reject</button>}
                  {o.status === 'approved' && <button name="decision" value="suspend" className="btn btn-ghost">Suspend</button>}
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
