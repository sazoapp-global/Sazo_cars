import { CONCERNS, formatDate } from '@sazo/contracts';
import type { ConcernQueueItem } from '@/lib/types';
import { decideConcern } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

export const metadata = { title: 'Reported problems' };
const STATUSES = [['open', 'Waiting'], ['upheld', 'Upheld'], ['dismissed', 'Dismissed']] as const;
const ORG: Record<string, string> = { garage: 'Garage', inspector: 'Inspector', inspection_centre: 'Inspection centre', dealer: 'Dealer' };

export default async function Concerns({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/concerns');
  const sp = await searchParams;
  const status = STATUSES.some(([s]) => s === sp.status) ? sp.status! : 'open';
  const data = await adminFetch<{ items: ConcernQueueItem[] }>(`/admin/concerns?status=${status}`);
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Reported problems</h1>
      <p className="mb-4 text-muted">Garages and inspectors report signs of fraud. While a serious report waits, buyers see only &ldquo;a business has raised a concern; SAZO is checking&rdquo;. Uphold only what you could confirm — buyers then see it. The reporting business is never named to buyers.</p>
      <Notice done={sp.done} error={sp.error} />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map(([s, label]) => (
          <a key={s} href={`/admin/concerns?status=${s}`} aria-current={s === status ? 'true' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s === status ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-white'}`}>{label}</a>
        ))}
      </nav>
      {data === 'forbidden' ? <Forbidden what="reviewing reported problems" /> : data.items.length === 0 ? <p className="text-muted">Nothing here.</p> : (
        <ul className="space-y-3">
          {data.items.map((c) => (
            <li key={c.concernId} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip ${c.severity === 'serious' ? 'border-bad-line bg-bad-fill text-bad-text' : 'border-warn-line bg-warn-fill text-warn-text'}`}>{c.severity}</span>
                <span className="sazo-id font-bold">{c.plate}</span>
                {c.vehicleRef ? <a href={`/v/${c.vehicleRef}`} className="link text-sm" target="_blank" rel="noreferrer">report {c.vehicleRef}</a> : <span className="text-sm text-warn-text">Not matched to a car yet</span>}
                <span className="text-sm text-muted">{formatDate(c.createdAt)}</span>
              </div>
              <h2 className="mt-1 font-display text-lg font-bold">{CONCERNS[c.category].label}</h2>
              <p className="text-sm text-muted">From {c.reporter} · {c.organisation} ({ORG[c.organisationType ?? ''] ?? 'Business'})</p>
              <p className="mt-2 whitespace-pre-line">{c.description}</p>
              {c.evidenceIds.length > 0 && <p className="mt-1 text-sm">Photos: {c.evidenceIds.map((d, i) => <a key={d} className="link mr-2" href={`/admin/files/${d}`} target="_blank" rel="noreferrer">photo {i + 1}</a>)}</p>}
              {c.status === 'open' ? (
                <form action={decideConcern} className="mt-3 grid gap-2 md:grid-cols-[1fr_12rem_auto] md:items-end">
                  <input type="hidden" name="id" value={c.concernId} />
                  <div><label htmlFor={`r-${c.concernId}`} className="label">Reason (kept in the audit log; the business sees it)</label>
                    <input id={`r-${c.concernId}`} name="reason" required minLength={3} className="field" placeholder="e.g. Chassis photo matches the stolen-vehicle record" /></div>
                  <div><label htmlFor={`v-${c.concernId}`} className="label">Car reference {c.vehicleRef ? '(optional)' : ''}</label>
                    <input id={`v-${c.concernId}`} name="vehicleRef" className="field sazo-id" placeholder="SZV-…" defaultValue="" /></div>
                  <div className="flex gap-2">
                    <button name="decision" value="uphold" className="btn btn-primary">Uphold</button>
                    <button name="decision" value="dismiss" className="btn btn-ghost">Dismiss</button>
                  </div>
                </form>
              ) : <p className="mt-2 text-sm"><strong>{c.status === 'upheld' ? 'Upheld' : 'Dismissed'}:</strong> {c.decisionReason}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
