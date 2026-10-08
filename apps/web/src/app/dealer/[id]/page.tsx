import { QUESTION_TITLES, formatDate, formatKm, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { statusIcon } from '@/components/status';
import { vehicleName } from '@/components/vehicle-card';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { MyOrganisation, StaffMember, StockItem } from '@/lib/types';
import { shareReport } from '../../buyer-actions';
import { addStaff, addStock, changePrice, markSold, removeStock } from '../actions';

export const metadata: Metadata = { title: 'Cars for sale', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string; show?: string }>;

export default async function DealerStock({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  const name = org.tradingName ?? org.legalName;
  if (org.status !== 'approved') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
        <h1 className="font-display text-2xl font-bold">{name}</h1>
        <p className="card mt-4 p-4">You can list cars once SAZO has approved your business. <Link href={`/business/${id}`} className="link">See your approval progress</Link>.</p>
      </div>
    );
  }
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const show = sp.show === 'sold' ? 'sold' : 'in_stock';
  const [{ items }, staff] = await Promise.all([
    api<{ items: StockItem[] }>(`/dealer/stock?status=${show}`, as),
    org.role === 'org_manager' ? api<StaffMember[]>('/garage/staff', as).catch((err) => { if (err instanceof ApiError) return []; throw err; }) : Promise.resolve(undefined),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-label">Dealer</p>
        <h1 className="font-display text-2xl font-bold">{name} — cars for sale</h1>
        <p className="mt-1 text-muted">Each car you list, its asking price and its sale become part of its SAZO history. Send buyers a report link so they can check the car themselves.</p>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      <details className="card p-4 md:p-5" open={items.length === 0 && show === 'in_stock'}>
        <summary className="cursor-pointer font-display text-lg font-semibold">Add a car</summary>
        <form action={addStock} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="org" value={id} />
          <div><label htmlFor="plate" className="label">Number plate</label><input id="plate" name="plate" className="field sazo-id" autoCapitalize="characters" autoComplete="off" placeholder="UBK 482M" /></div>
          <div><label htmlFor="anchor" className="label">VIN or chassis number</label><input id="anchor" name="anchor" className="field sazo-id" autoCapitalize="characters" autoComplete="off" />
            <p className="mt-1 text-sm text-muted">Needed if SAZO doesn&apos;t know the car yet.</p></div>
          <div><label htmlFor="price" className="label">Asking price (UGX) *</label><input id="price" name="price" required inputMode="numeric" className="field tabular-nums" placeholder="38,500,000" /></div>
          <div><label htmlFor="mileage" className="label">Mileage now (km)</label><input id="mileage" name="mileage" inputMode="numeric" className="field tabular-nums" /></div>
          <div className="sm:col-span-2"><label htmlFor="notes" className="label">Notes for your team (not shown to buyers)</label><input id="notes" name="notes" maxLength={500} className="field" /></div>
          <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="add" />Add to stock</button>
            <p className="mt-2 text-sm text-muted">The asking price and mileage are added to the car&apos;s history as a dealer listing. A car new to SAZO shows as &ldquo;not yet confirmed&rdquo; until an official record matches it.</p></div>
        </form>
      </details>

      <nav aria-label="Filter" className="flex gap-2">
        {([['in_stock', 'For sale'], ['sold', 'Sold']] as const).map(([s, label]) => (
          <Link key={s} href={`/dealer/${id}${s === 'sold' ? '?show=sold' : ''}`} aria-current={s === show ? 'true' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s === show ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-white'}`}>{label}</Link>
        ))}
      </nav>

      {items.length === 0 ? <p className="text-muted">{show === 'sold' ? 'No sales recorded yet.' : 'No cars for sale yet. Add one above.'}</p> : (
        <ul className="space-y-3">
          {items.map((c) => {
            const v = c.vehicle;
            const title = v ? vehicleName(v) : 'Vehicle';
            return (
              <li key={c.stockId} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {v?.currentPlate && <Plate value={v.currentPlate} size="sm" />}
                  {v?.status === 'provisional' && <span className="chip border-warn-line bg-warn-fill text-warn-text">Not yet confirmed</span>}
                  <span className="text-xs text-muted">listed {formatDate(c.listedAt)}{c.listedMileageKm !== null ? ` at ${formatKm(c.listedMileageKm)}` : ''}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-bold">{c.vehicleRef ? <Link href={`/v/${c.vehicleRef}`} className="hover:underline">{title}</Link> : title}</h2>
                  <p className="font-display text-lg font-extrabold tabular-nums">{c.status === 'sold' ? <>Sold {formatDate(c.soldAt)} · {formatUgx(c.salePriceUgx!)}</> : formatUgx(c.askingPriceUgx)}</p>
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="What the records show">
                  {c.questions.map((q) => {
                    const s = statusIcon(q.status);
                    return <li key={q.question} className={`flex items-center gap-1 font-semibold ${s.cls}`}><Icon name={s.icon} size={14} />{QUESTION_TITLES[q.question]?.short}</li>;
                  })}
                </ul>
                {c.notes && <p className="mt-2 text-sm text-muted">Note: {c.notes}</p>}
                {c.status === 'sold' && <p className="mt-2 text-sm text-muted">The sale price is kept private — buyers never see it.</p>}
                {c.status === 'in_stock' && c.vehicleRef && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <form action={shareReport} className="col-span-2"><input type="hidden" name="ref" value={c.vehicleRef} />
                      <button className="btn btn-primary w-full"><Icon name="share" />Link for a buyer</button></form>
                    <details className="open:col-span-2">
                      <summary className="btn btn-ghost w-full cursor-pointer list-none">Change price</summary>
                      <form action={changePrice} className="mt-2 flex gap-2">
                        <input type="hidden" name="org" value={id} /><input type="hidden" name="id" value={c.stockId} />
                        <label htmlFor={`p-${c.stockId}`} className="sr-only">New asking price for {title} (UGX)</label>
                        <input id={`p-${c.stockId}`} name="price" required inputMode="numeric" className="field tabular-nums" placeholder="UGX" />
                        <button className="btn btn-ghost">Save</button>
                      </form>
                    </details>
                    <details className="open:col-span-2">
                      <summary className="btn btn-ghost w-full cursor-pointer list-none">Mark as sold</summary>
                      <form action={markSold} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <input type="hidden" name="org" value={id} /><input type="hidden" name="id" value={c.stockId} />
                        <div><label htmlFor={`s-${c.stockId}`} className="label">Sold for (UGX) — private</label>
                          <input id={`s-${c.stockId}`} name="price" required inputMode="numeric" className="field tabular-nums" /></div>
                        <div><label htmlFor={`d-${c.stockId}`} className="label">Date</label>
                          <input id={`d-${c.stockId}`} name="soldOn" type="date" max={today} defaultValue={today} className="field" /></div>
                        <button className="btn btn-primary self-end">Record sale</button>
                      </form>
                    </details>
                    <form action={removeStock} className="col-span-2 sm:col-span-1"><input type="hidden" name="org" value={id} /><input type="hidden" name="id" value={c.stockId} />
                      <button className="btn btn-ghost w-full" aria-label={`Remove ${title} without a sale`}><Icon name="delete" />Remove</button></form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {staff && (
        <section className="card p-4 md:p-5" aria-labelledby="staff">
          <h2 id="staff" className="font-display text-lg font-semibold">Your team</h2>
          <ul className="mt-2 divide-y divide-line">
            {staff.map((m) => <li key={m.userId} className="flex justify-between gap-3 py-2"><span>{m.displayName}</span><span className="text-sm text-muted">{m.role === 'org_manager' ? 'Manager' : 'Sales'}</span></li>)}
          </ul>
          <form action={addStaff} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <input type="hidden" name="org" value={id} />
            <div><label htmlFor="sname" className="label">Name</label><input id="sname" name="name" required className="field" /></div>
            <div><label htmlFor="sphone" className="label">Phone</label><input id="sphone" name="phone" type="tel" required className="field" placeholder="0772 123 456" /></div>
            <div><label htmlFor="srole" className="label">Role</label><select id="srole" name="role" className="field"><option value="org_staff">Sales</option><option value="org_manager">Manager</option></select></div>
            <button className="btn btn-ghost"><Icon name="add" />Add</button>
          </form>
        </section>
      )}
    </div>
  );
}
