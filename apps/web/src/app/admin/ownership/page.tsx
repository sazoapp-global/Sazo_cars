import { pageHref, paginate } from '@/components/pager';
import { formatDate, kindLabel } from '@sazo/contracts';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { api } from '@/lib/api';
import { Plate } from '@/components/plate';
import type { OwnershipClaim, Summary } from '@/lib/types';
import { PhotoPreviews } from '../photo-previews';
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
  const Q = { status: sp.status, item: sp.item , page: sp.page };
  if (sp.person) return <PersonView userId={sp.person} back={withQuery(PATH, Q, {})} backLabel="Back" />;
  const one = data !== 'forbidden' && sp.item ? data.items.find((c) => c.claimId === sp.item) : undefined;
  if (one) {
    const c = one;
    const car = (await api<Summary>(`/vehicles/${c.vehicleRef}/summary`).catch(() => undefined))?.vehicle;
    const carName = car ? [car.year, car.make, car.model].filter(Boolean).join(' ') : null;
    return (
      <>
        <Back href={withQuery(PATH, Q, { item: undefined })} label="All ownership claims" />
        <Notice done={sp.done} error={sp.error} />
        <section className="card p-4" aria-label="Details">
              <div className="flex flex-wrap items-center gap-2">
                {c.plate && <Plate value={c.plate} size="sm" />}
                <span className="text-sm text-muted">sent {formatDate(c.claimedAt)}</span>
              </div>
              <h1 className="mt-1 font-display text-2xl font-bold">{c.claimant || 'Unnamed account'}</h1>
              {/* The car being claimed, with its report one tap away (14 Nov 2026). */}
              <div className="mt-3 flex flex-wrap items-center gap-3.5 rounded-xl border border-line bg-soft px-3.5 py-3">
                <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-container text-white"><Icon name="directions_car" size={24} /></span>
                <span className="min-w-[200px] flex-1">
                  <span className="block text-[16px] font-bold">{carName || (c.plate ?? 'This car')}</span>
                  <span className="block text-sm text-muted">{[car?.kind ? kindLabel(car.kind) : null, car?.engineCc ? `${car.engineCc.toLocaleString('en-GB')} cc` : null, `SAZO report ${c.vehicleRef}`].filter(Boolean).join(' · ')}</span>
                </span>
                <Link href={carHref(c.vehicleRef, withQuery(PATH, Q, {}))} className="btn btn-ghost bg-white"><Icon name="description" size={20} />View car report<Icon name="arrow_forward" size={18} /></Link>
              </div>
              <PhotoPreviews ids={c.evidenceIds} title="Logbook" noun="Logbook photo" />
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
        <Rows label="Ownership claims" paging={{ paged: paginate(data.items, sp.page), href: pageHref(PATH, { ...Q, item: undefined }), noun: 'claims' }}>
          {paginate(data.items, sp.page).items.map((c) => <Row key={c.claimId} href={withQuery(PATH, Q, { item: c.claimId })} title={c.claimant || 'Unnamed account'} meta={`${c.plate ?? c.vehicleRef} · sent ${formatDate(c.claimedAt)}`} status={'Logbook to check'} tone={'warn'} />)}
        </Rows>
      )}
    </>
  );
}
