import { QUESTION_TITLES, formatDate, formatKm, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { statusIcon } from '@/components/status';
import { vehicleName } from '@/components/vehicle-card';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation, StaffMember, StockItem } from '@/lib/types';
import { NumberStrip, WorkspaceFrame } from '@/components/workspace-frame';
import { shareReport } from '../../buyer-actions';
import { addStaff, addStock, changePrice, markSold, removeStock } from '../actions';

export const metadata: Metadata = { title: 'Cars for sale', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string; show?: string; findings?: string; q?: string }>;

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
  const onlyFindings = sp.findings === '1';
  const q = (sp.q ?? '').replace(/\s/g, '').toUpperCase();
  const [inStock, soldList, staff, me] = await Promise.all([
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items),
    api<{ items: StockItem[] }>('/dealer/stock?status=sold', as).then((r) => r.items),
    org.role === 'org_manager' ? api<StaffMember[]>('/garage/staff', as).catch((err) => { if (err instanceof ApiError) return []; throw err; }) : Promise.resolve(undefined),
    api<Me>('/me', { auth: true }).catch(() => undefined),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const days = (from: string) => Math.max(0, Math.floor((Date.now() - Date.parse(from)) / 86_400_000));
  const findings = (c: StockItem) => ({ serious: c.questions.filter((x) => x.status === 'serious').length, attention: c.questions.filter((x) => x.status === 'attention').length });
  const flagged = inStock.filter((c) => findings(c).serious > 0);
  const monthStart = today.slice(0, 7);
  const soldThisMonth = soldList.filter((c) => (c.soldAt ?? '').slice(0, 7) === monthStart).length;
  const avgDays = inStock.length ? Math.round(inStock.reduce((n, c) => n + days(c.listedAt), 0) / inStock.length) : undefined;
  const base = show === 'sold' ? soldList : inStock;
  const items = base.filter((c) => (!onlyFindings || findings(c).serious + findings(c).attention > 0)
    && (!q || (c.vehicle?.currentPlate ?? '').replace(/\s/g, '').toUpperCase().includes(q) || (c.vehicle ? vehicleName(c.vehicle) : '').replace(/\s/g, '').toUpperCase().includes(q)));
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ show: show === 'sold' ? 'sold' : undefined, findings: onlyFindings ? '1' : undefined, q: sp.q || undefined, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/dealer/${id}${p.size ? `?${p}` : ''}`;
  };

  return (
    <WorkspaceFrame kind="Dealer" name={name} approved
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}
      items={[
        { href: `/dealer/${id}`, label: 'For sale', icon: 'storefront', count: inStock.length, active: show === 'in_stock' },
        { href: `/dealer/${id}?show=sold`, label: 'Sold', icon: 'sell', count: soldList.length, active: show === 'sold' },
        ...(staff ? [{ href: `/dealer/${id}#staff-section`, label: 'Team', icon: 'group' as const, count: staff.length }] : []),
        { href: `/business/${id}`, label: 'Business details', icon: 'verified_user' as const },
      ]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name} — cars for sale</h1>
          <p className="mt-1 max-w-2xl text-muted">Each car you list, its asking price and its sale become part of its SAZO history. Send buyers a report link so they can check the car themselves.</p>
        </div>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {flagged.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border-2 border-bad-line bg-bad-fill p-4 shadow-sm">
          <Icon name="report" size={22} className="shrink-0 text-bad-text" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-bad-text">{flagged.length} {flagged.length === 1 ? 'car in stock has' : 'cars in stock have'} a serious finding in {flagged.length === 1 ? 'its' : 'their'} records</p>
            <p className="text-sm text-on-surface">{flagged.map((c) => c.vehicle?.currentPlate ?? (c.vehicle ? vehicleName(c.vehicle) : 'A car')).join(', ')} — check before you sell. Buyers see the same findings.</p>
          </div>
          <Link href={href({ show: undefined, findings: '1' })} className="link text-sm text-bad-text">Show them</Link>
        </div>
      )}

      <NumberStrip cells={[
        { label: 'In stock', value: String(inStock.length) },
        { label: 'Sold this month', value: String(soldThisMonth), sub: `${soldList.length} sold in total` },
        { label: 'Cars to check', value: String(flagged.length), sub: 'Serious finding in the records', tone: flagged.length ? 'bad' : undefined },
        { label: 'Average days in stock', value: avgDays === undefined ? '—' : String(avgDays), sub: 'Cars for sale now' },
      ]} />

      <details className="rounded-[14px] border border-line bg-soft/50 p-4 md:p-5" open={(inStock.length === 0 && show === 'in_stock') || !!sp.error}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-lg font-bold text-primary-container"><Icon name="add" />Add a car</summary>
        <form action={addStock} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="org" value={id} />
          <div><label htmlFor="plate" className="label">Number plate</label><input id="plate" name="plate" className="field sazo-id" autoCapitalize="characters" autoComplete="off" placeholder="UBK 482M" /></div>
          <div><label htmlFor="anchor" className="label">VIN or chassis number</label><input id="anchor" name="anchor" className="field sazo-id" autoCapitalize="characters" autoComplete="off" />
            <p className="mt-1 text-sm text-muted">Needed if SAZO doesn&apos;t know the car yet.</p></div>
          <div><label htmlFor="price" className="label">Asking price (UGX) *</label><input id="price" name="price" required inputMode="numeric" className="field tabular-nums" placeholder="38,500,000" />
            <p className="mt-1 text-xs text-muted"><Icon name="visibility" size={12} className="mr-1 inline align-[-1px]" />Shown to buyers as part of the car&apos;s history</p></div>
          <div><label htmlFor="mileage" className="label">Mileage now (km)</label><input id="mileage" name="mileage" inputMode="numeric" className="field tabular-nums" />
            <p className="mt-1 text-xs text-muted"><Icon name="visibility" size={12} className="mr-1 inline align-[-1px]" />Shown to buyers</p></div>
          <div className="sm:col-span-2"><label htmlFor="odometer" className="label">Odometer photo (needed with a mileage)</label>
            <input id="odometer" name="odometer" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
          <div className="sm:col-span-2"><label htmlFor="notes" className="label">Notes for your team (not shown to buyers)</label><input id="notes" name="notes" maxLength={500} className="field" />
            <p className="mt-1 text-xs text-muted"><Icon name="lock" size={12} className="mr-1 inline align-[-1px]" />Private</p></div>
          <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="add" />Add to stock</button>
            <p className="mt-2 text-sm text-muted">The asking price and mileage are added to the car&apos;s history as a dealer listing. A car new to SAZO shows as &ldquo;not yet confirmed&rdquo; until an official record matches it.</p></div>
        </form>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter" className="flex overflow-hidden rounded-lg border border-line-strong text-sm font-semibold">
          {([['in_stock', 'For sale', inStock.length], ['sold', 'Sold', soldList.length]] as const).map(([s, label, n], i) => (
            <Link key={s} href={href({ show: s === 'sold' ? 'sold' : undefined })} aria-current={s === show ? 'true' : undefined}
              className={`px-3 py-2 ${i ? 'border-l border-line-strong' : ''} ${s === show ? 'bg-primary-container text-white' : 'bg-white hover:bg-soft'}`}>{label} <span className={s === show ? 'text-white/80' : 'text-muted'}>{n}</span></Link>
          ))}
        </nav>
        <Link href={href({ findings: onlyFindings ? undefined : '1' })}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${onlyFindings ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white'}`}>{onlyFindings ? 'Has findings ✕' : 'Has findings'}</Link>
        <form action={`/dealer/${id}`} method="get" role="search" className="ml-auto flex min-w-60 flex-1 gap-2 sm:flex-none">
          {show === 'sold' && <input type="hidden" name="show" value="sold" />}
          {onlyFindings && <input type="hidden" name="findings" value="1" />}
          <label htmlFor="stock-q" className="sr-only">Search plate, make or model</label>
          <input id="stock-q" name="q" defaultValue={sp.q} placeholder="Search plate, make, model" className="field !min-h-10 text-sm" />
          <button className="btn btn-ghost !min-h-10 !px-3" aria-label="Search"><Icon name="search" size={18} /></button>
        </form>
      </div>

      {items.length === 0 ? <p className="rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">{q || onlyFindings ? 'No cars match.' : show === 'sold' ? 'No sales recorded yet.' : 'No cars for sale yet. Add one above.'}</p> : (
        <div>
          <div aria-hidden className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.6fr)] gap-4 border-b-2 border-line-strong px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-label md:grid">
            <span>Car</span><span>Findings</span><span className="text-right">{show === 'sold' ? 'Sold for' : 'Asking price'}</span><span className="text-right">Days</span>
          </div>
          <ul className="divide-y divide-line">
            {items.map((c) => {
              const v = c.vehicle;
              const title = v ? vehicleName(v) : 'Vehicle';
              const f = findings(c);
              return (
                <li key={c.stockId} className={`px-4 py-4 ${f.serious ? 'bg-bad-fill/30' : ''}`}>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.6fr)] md:items-start md:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {v?.currentPlate && <Plate value={v.currentPlate} size="sm" />}
                        {v?.status === 'provisional' && <span className="chip border-warn-line bg-warn-fill text-warn-text">Not yet confirmed</span>}
                      </div>
                      <h2 className="mt-1 font-display text-base font-bold">{c.vehicleRef ? <Link href={`/v/${c.vehicleRef}`} className="hover:underline">{title}</Link> : title}</h2>
                      <p className="text-xs text-muted">Listed {formatDate(c.listedAt)}{c.listedMileageKm !== null ? ` at ${formatKm(c.listedMileageKm)}` : ''}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{f.serious + f.attention === 0 ? <span className="text-ok-text">Nothing flagged</span> : <>
                        {f.serious > 0 && <span className="text-bad-text">{f.serious} serious</span>}{f.serious > 0 && f.attention > 0 && ' · '}{f.attention > 0 && <span className="text-warn-text">{f.attention} to check</span>}</>}</p>
                      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="What the records show">
                        {c.questions.map((x) => {
                          const st = statusIcon(x.status);
                          return <li key={x.question} className={`flex items-center gap-1 font-semibold ${st.cls}`}><Icon name={st.icon} size={14} />{QUESTION_TITLES[x.question]?.short}</li>;
                        })}
                      </ul>
                    </div>
                    <p className="font-display text-lg font-extrabold tabular-nums md:text-right">{c.status === 'sold' ? <>Sold {formatDate(c.soldAt)} · {formatUgx(c.salePriceUgx!)}</> : formatUgx(c.askingPriceUgx)}</p>
                    <p className="text-sm text-muted md:text-right"><span className="md:hidden">In stock for </span><span className="font-semibold tabular-nums text-ink">{days(c.listedAt)}</span><span className="md:hidden"> days</span></p>
                  </div>
                  {c.notes && <p className="mt-2 text-sm text-muted">Note: {c.notes}</p>}
                  {c.status === 'sold' && <p className="mt-2 text-sm text-muted">The sale price is kept private — buyers never see it.</p>}
                  {c.status === 'in_stock' && c.vehicleRef && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <form action={shareReport} className="col-span-2"><input type="hidden" name="ref" value={c.vehicleRef} />
                        <button className="btn btn-primary w-full"><Icon name="share" />Link for a buyer</button></form>
                      <details className="open:col-span-2">
                        <summary className="btn btn-ghost w-full cursor-pointer list-none bg-white">Change price</summary>
                        <form action={changePrice} className="mt-2 flex gap-2">
                          <input type="hidden" name="org" value={id} /><input type="hidden" name="id" value={c.stockId} />
                          <label htmlFor={`p-${c.stockId}`} className="sr-only">New asking price for {title} (UGX)</label>
                          <input id={`p-${c.stockId}`} name="price" required inputMode="numeric" className="field tabular-nums" placeholder="UGX" />
                          <button className="btn btn-ghost">Save</button>
                        </form>
                      </details>
                      <details className="open:col-span-2">
                        <summary className="btn btn-ghost w-full cursor-pointer list-none bg-white">Mark as sold</summary>
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
                        <button className="btn btn-ghost w-full bg-white" aria-label={`Remove ${title} without a sale`}><Icon name="delete" />Remove</button></form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {staff && (
        <section id="staff-section" className="scroll-mt-24 rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="staff">
          <h2 id="staff" className="font-display text-lg font-bold">Your team</h2>
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
    </WorkspaceFrame>
  );
}
