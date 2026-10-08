import { formatDate } from '@sazo/contracts';
import { Plate } from '@/components/plate';
import type { OwnershipClaim } from '@/lib/types';
import { decideOwnership } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

export const metadata = { title: 'Ownership claims' };

export default async function Ownership({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/ownership');
  const sp = await searchParams;
  const data = await adminFetch<{ items: OwnershipClaim[] }>('/admin/ownership-claims');
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Ownership claims</h1>
      <p className="mb-4 text-muted">People whose phone is not on the registry record sent a logbook photo. Approve only if the logbook shows this car (plate or chassis) and the owner&apos;s name matches the person.</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="checking ownership claims" /> : data.items.length === 0 ? <p className="text-muted">No claims waiting.</p> : (
        <ul className="space-y-3">
          {data.items.map((c) => (
            <li key={c.claimId} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                {c.plate && <Plate value={c.plate} size="sm" />}
                <a href={`/v/${c.vehicleRef}`} className="link text-sm" target="_blank" rel="noreferrer">report {c.vehicleRef}</a>
                <span className="text-sm text-muted">sent {formatDate(c.claimedAt)}</span>
              </div>
              <h2 className="mt-1 font-display text-lg font-bold">{c.claimant || 'Unnamed account'}</h2>
              <p className="text-sm">Logbook: {c.evidenceIds.map((d, i) => <a key={d} className="link mr-2" href={`/admin/files/${d}`} target="_blank" rel="noreferrer">photo {i + 1}</a>)}</p>
              <form action={decideOwnership} className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
                <input type="hidden" name="id" value={c.claimId} />
                <div className="flex-1"><label htmlFor={`r-${c.claimId}`} className="label">Reason (shown to the person and kept in the audit log)</label>
                  <input id={`r-${c.claimId}`} name="reason" required minLength={3} className="field" placeholder="e.g. Name and plate on logbook match" /></div>
                <div className="flex gap-2">
                  <button name="decision" value="approve" className="btn btn-primary">Approve</button>
                  <button name="decision" value="reject" className="btn btn-ghost">Reject</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
