import { formatDate } from '@sazo/contracts';
import { Plate } from '@/components/plate';
import type { OwnershipClaim } from '@/lib/types';
import { decideOwnership } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';
import { Back, PersonView, Row, Rows, carHref, withQuery } from '../rows';

export const metadata = { title: 'Ownership claims' };

export default async function Ownership({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/ownership');
  const sp = await searchParams;
  const data = await adminFetch<{ items: OwnershipClaim[] }>('/admin/ownership-claims');
  const PATH = '/admin/ownership';
  const Q = { status: sp.status, item: sp.item };
  if (sp.person) return <PersonView userId={sp.person} back={withQuery(PATH, Q, {})} backLabel="Back" />;
  const one = data !== 'forbidden' && sp.item ? data.items.find((c) => c.claimId === sp.item) : undefined;
  if (one) {
    const c = one;
    return (
      <>
        <Back href={withQuery(PATH, Q, { item: undefined })} label="All ownership claims" />
        <Notice done={sp.done} error={sp.error} />
        <section className="card p-4" aria-label="Details">
              <div className="flex flex-wrap items-center gap-2">
                {c.plate && <Plate value={c.plate} size="sm" />}
                <a href={carHref(c.vehicleRef, withQuery(PATH, Q, {}))} className="link text-sm">report {c.vehicleRef}</a>
                <span className="text-sm text-muted">sent {formatDate(c.claimedAt)}</span>
              </div>
              <h1 className="mt-1 font-display text-2xl font-bold">{c.claimant || 'Unnamed account'}</h1>
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
                    </section>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Ownership claims</h1>
      <p className="mb-4 text-muted">People whose phone is not on the registry record sent a logbook photo. Approve only if the logbook shows this car (plate or chassis) and the owner&apos;s name matches the person.</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="checking ownership claims" /> : data.items.length === 0 ? <p className="text-muted">No claims waiting.</p> : (
        <Rows label="Ownership claims">
          {data.items.map((c) => <Row key={c.claimId} href={withQuery(PATH, Q, { item: c.claimId })} title={c.claimant || 'Unnamed account'} meta={`${c.plate ?? c.vehicleRef} · sent ${formatDate(c.claimedAt)}`} status={'Logbook to check'} tone={'warn'} />)}
        </Rows>
      )}
    </>
  );
}
