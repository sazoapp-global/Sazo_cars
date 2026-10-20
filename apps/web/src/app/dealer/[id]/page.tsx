import { QUESTION_TITLES, formatDate, formatKm, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { statusIcon } from '@/components/status';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { DealerSettings, Me, MyOrganisation, StaffMember, StockItem } from '@/lib/types';
import { NumberStrip, WorkspaceFrame } from '@/components/workspace-frame';
import { shareReport } from '../../buyer-actions';
import { addStaff, addStock, changePrice, markSold, removeStock, saveSettings } from '../actions';
import { BondClock, FUELS, STAGES, StockAge, carName, stageLabel } from '../labels';

export const metadata: Metadata = { title: 'Cars for sale', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string; show?: string; findings?: string; q?: string; add?: string }>;

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
  const manager = org.role === 'org_manager';
  const [inStock, soldList, staff, me, settings] = await Promise.all([
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items),
    api<{ items: StockItem[] }>('/dealer/stock?status=sold', as).then((r) => r.items),
    org.role === 'org_manager' ? api<StaffMember[]>('/garage/staff', as).catch((err) => { if (err instanceof ApiError) return []; throw err; }) : Promise.resolve(undefined),
    api<Me>('/me', { auth: true }).catch(() => undefined),
    api<DealerSettings>('/dealer/settings', as).catch(() => undefined),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const findings = (c: StockItem) => ({ serious: c.questions.filter((x) => x.status === 'serious').length, attention: c.questions.filter((x) => x.status === 'attention').length });
  const flagged = inStock.filter((c) => findings(c).serious > 0);
  const monthStart = today.slice(0, 7);
  const soldThisMonth = soldList.filter((c) => (c.soldAt ?? '').slice(0, 7) === monthStart).length;
  const avgDays = inStock.length ? Math.round(inStock.reduce((n, c) => n + c.clocks.daysInStock, 0) / inStock.length) : undefined;
  const ageing = inStock.filter((c) => c.clocks.stockAgeLevel > 0).length;
  const bondUrgent = inStock.filter((c) => c.clocks.bond.level === 'soon' || c.clocks.bond.level === 'overdue');
  const base = show === 'sold' ? soldList : inStock;
  const items = base.filter((c) => (!onlyFindings || findings(c).serious + findings(c).attention > 0)
    && (!q || (c.vehicle?.currentPlate ?? '').replace(/\s/g, '').toUpperCase().includes(q) || carName(c).replace(/\s/g, '').toUpperCase().includes(q)));
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ show: show === 'sold' ? 'sold' : undefined, findings: onlyFindings ? '1' : undefined, q: sp.q || undefined, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/dealer/${id}${p.size ? `?${p}` : ''}`;
  };

  return (
    <WorkspaceFrame kind="Dealer" name={name} approved
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}
      items={[
        { href: `/dealer/${id}`, label: 'For sale', icon: 'storefront', count: inStock.length, active: show === 'in_stock' },
        { href: `/dealer/${id}/enquiries`, label: 'Enquiries', icon: 'forum' },
        ...(manager ? [{ href: `/dealer/${id}/commissions`, label: 'Commission', icon: 'payments' as const }] : []),
        ...(manager ? [{ href: `/dealer/${id}/import`, label: 'Add many cars', icon: 'upload_file' as const }] : []),
        { href: `/dealer/${id}?show=sold`, label: 'Sold', icon: 'sell', count: soldList.length, active: show === 'sold' },
        ...(staff ? [{ href: `/dealer/${id}#staff-section`, label: 'Team', icon: 'group' as const, count: staff.length }] : []),
        ...(manager ? [{ href: `/dealer/${id}#settings-section`, label: 'Settings', icon: 'edit' as const }] : []),
        { href: `/business/${id}`, label: 'Business details', icon: 'verified_user' as const },
      ]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name}: cars for sale</h1>
          <p className="mt-1 max-w-2xl text-muted">Add your cars, follow their import costs and bond deadlines, and send buyers a link with each car&apos;s SAZO history.</p>
        </div>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {flagged.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border-2 border-bad-line bg-bad-fill p-4 shadow-sm">
          <Icon name="report" size={22} className="shrink-0 text-bad-text" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-bad-text">{flagged.length} {flagged.length === 1 ? 'car in stock has' : 'cars in stock have'} a serious finding in {flagged.length === 1 ? 'its' : 'their'} records</p>
            <p className="text-sm text-on-surface">{flagged.map((c) => c.vehicle?.currentPlate ?? carName(c)).join(', ')}. Check before you sell. Buyers see the same findings.</p>
          </div>
          <Link href={href({ show: undefined, findings: '1' })} className="link text-sm text-bad-text">Show them</Link>
        </div>
      )}

      {bondUrgent.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border-2 border-warn-line bg-warn-fill p-4 shadow-sm">
          <Icon name="inventory_2" size={22} className="shrink-0 text-warn-text" />
          <p className="min-w-0 flex-1 font-bold text-warn-text">{bondUrgent.length} {bondUrgent.length === 1 ? 'car is' : 'cars are'} close to or past the bond deadline you entered: {bondUrgent.map(carName).join(', ')}</p>
        </div>
      )}

      <NumberStrip cells={[
        { label: 'In stock', value: String(inStock.length) },
        { label: 'Sold this month', value: String(soldThisMonth), sub: `${soldList.length} sold in total` },
        { label: 'Cars to check', value: String(flagged.length), sub: 'Serious finding in the records', tone: flagged.length ? 'bad' : undefined },
        { label: 'Average days in stock', value: avgDays === undefined ? 'None' : String(avgDays), sub: ageing ? `${ageing} past your alert levels` : 'Cars for sale now', tone: ageing ? 'bad' : undefined },
      ]} />

      <details className="rounded-[14px] border border-line bg-soft/50 p-4 md:p-5" open={(inStock.length === 0 && show === 'in_stock') || sp.add === '1'}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-lg font-bold text-primary-container"><Icon name="add" />Add a car</summary>
        <p className="mt-1 text-sm text-muted">Start with the basics. You can add import costs and more photos later.{manager && <> Many cars at once? <Link href={`/dealer/${id}/import`} className="link">Add them from an Excel file</Link>.</>}</p>
        <form action={addStock} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="org" value={id} />
          <div className="sm:col-span-2"><label htmlFor="photos" className="label">Photos of the car</label>
            <input id="photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
          <div><label htmlFor="make" className="label">Make</label><input id="make" name="make" className="field" placeholder="Toyota" autoComplete="off" /></div>
          <div><label htmlFor="model" className="label">Model</label><input id="model" name="model" className="field" placeholder="Harrier" autoComplete="off" /></div>
          <div><label htmlFor="modelYear" className="label">Year</label><input id="modelYear" name="modelYear" inputMode="numeric" maxLength={4} className="field tabular-nums" placeholder="2018" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="engineCc" className="label">Engine (cc)</label><input id="engineCc" name="engineCc" inputMode="numeric" className="field tabular-nums" placeholder="2000" /></div>
            <div><label htmlFor="fuel" className="label">Fuel</label><select id="fuel" name="fuel" className="field" defaultValue=""><option value="">Choose</option>{FUELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
          <div><label htmlFor="price" className="label">Asking price (UGX) *</label><input id="price" name="price" required inputMode="numeric" className="field tabular-nums" placeholder="75,000,000" />
            <p className="mt-1 text-xs text-muted"><Icon name="visibility" size={12} className="mr-1 inline align-[-1px]" />Shown to buyers once the car is linked to SAZO</p></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="stage" className="label">Where is it now?</label><select id="stage" name="stage" className="field" defaultValue="at_yard">{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label htmlFor="yard" className="label">Bond or yard</label><input id="yard" name="yard" className="field" placeholder="Kyambogo" /></div>
          </div>
          <div><label htmlFor="anchor" className="label">Chassis number or VIN</label><input id="anchor" name="anchor" className="field sazo-id" autoCapitalize="characters" autoComplete="off" />
            <p className="mt-1 text-sm text-muted">With the plate or the chassis number the car joins SAZO at once, even if SAZO does not know it yet.</p></div>
          <div><label htmlFor="plate" className="label">Number plate</label><input id="plate" name="plate" className="field sazo-id" autoCapitalize="characters" autoComplete="off" placeholder="UBK 482M" /></div>
          <details className="sm:col-span-2"><summary className="cursor-pointer text-sm font-semibold text-primary">Add the mileage now (needs the plate or chassis number and an odometer photo)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="mileage" className="label">Mileage now (km)</label><input id="mileage" name="mileage" inputMode="numeric" className="field tabular-nums" /></div>
              <div><label htmlFor="odometer" className="label">Odometer photo</label>
                <input id="odometer" name="odometer" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
            </div>
          </details>
          <div className="sm:col-span-2"><label htmlFor="notes" className="label">Notes for your team (not shown to buyers)</label><input id="notes" name="notes" maxLength={500} className="field" />
            <p className="mt-1 text-xs text-muted"><Icon name="lock" size={12} className="mr-1 inline align-[-1px]" />Private</p></div>
          <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="add" />Add the car</button></div>
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
              const title = carName(c);
              const carHref = `/dealer/${id}/car/${c.stockId}`;
              const f = findings(c);
              return (
                <li key={c.stockId} className={`px-4 py-4 ${f.serious ? 'bg-bad-fill/30' : ''}`}>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.6fr)] md:items-start md:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {v?.currentPlate && <Plate value={v.currentPlate} size="sm" />}
                        {!c.linked && <span className="chip border-line-strong bg-white text-muted">{c.waitingForReview ? 'SAZO is checking' : 'Plate or chassis number needed'}</span>}
                        {v?.status === 'provisional' && <span className="chip border-warn-line bg-warn-fill text-warn-text">Not yet confirmed</span>}
                      </div>
                      <h2 className="mt-1 font-display text-base font-bold"><Link href={carHref} className="hover:underline">{title}</Link></h2>
                      <p className="text-xs text-muted">{stageLabel(c.details.stage)}{c.details.yard ? `, ${c.details.yard}` : ''}. Listed {formatDate(c.listedAt)}{c.listedMileageKm !== null ? ` at ${formatKm(c.listedMileageKm)}` : ''}</p>
                      {c.status === 'in_stock' && <div className="mt-1 flex flex-wrap gap-1"><StockAge c={c} /><BondClock c={c} /></div>}
                    </div>
                    <div>
                      {!c.linked ? <p className="text-sm text-muted">{c.waitingForReview ? 'SAZO is checking which car this is. It joins SAZO by itself once that is done.' : 'Add the plate or chassis number to see what SAZO records show.'}</p> : <>
                      <p className="text-sm font-semibold">{f.serious + f.attention === 0 ? <span className="text-ok-text">Nothing flagged</span> : <>
                        {f.serious > 0 && <span className="text-bad-text">{f.serious} serious</span>}{f.serious > 0 && f.attention > 0 && ' · '}{f.attention > 0 && <span className="text-warn-text">{f.attention} to check</span>}</>}</p>
                      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="What the records show">
                        {c.questions.map((x) => {
                          const st = statusIcon(x.status);
                          return <li key={x.question} className={`flex items-center gap-1 font-semibold ${st.cls}`}><Icon name={st.icon} size={14} />{QUESTION_TITLES[x.question]?.short}</li>;
                        })}
                      </ul></>}
                    </div>
                    <div className="md:text-right">
                      <p className="font-display text-lg font-extrabold tabular-nums">{c.status === 'sold' ? <>Sold {formatDate(c.soldAt)}, {formatUgx(c.salePriceUgx!)}</> : formatUgx(c.askingPriceUgx)}</p>
                      {c.costTotalUgx !== undefined && c.costTotalUgx > 0 && <p className="text-xs text-muted">Cost {formatUgx(c.costTotalUgx)}{c.marginUgx !== null && c.marginUgx !== undefined ? `, margin ${formatUgx(c.marginUgx)}` : ''}</p>}
                    </div>
                    <p className="hidden text-sm text-muted md:block md:text-right"><span className="font-semibold tabular-nums text-ink">{c.clocks.daysInStock}</span></p>
                  </div>
                  {c.notes && <p className="mt-2 text-sm text-muted">Note: {c.notes}</p>}
                  {c.status === 'sold' && <p className="mt-2 text-sm text-muted">The sale price is kept private. Buyers never see it.</p>}
                  {c.status === 'in_stock' && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Link href={carHref} className="btn btn-primary col-span-2"><Icon name="edit" />Open the car</Link>
                      {c.vehicleRef && <form action={shareReport} className="col-span-2 sm:col-span-1"><input type="hidden" name="ref" value={c.vehicleRef} />
                        <button className="btn btn-ghost w-full bg-white"><Icon name="share" />Report link for a buyer</button></form>}
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
                          <div><label htmlFor={`s-${c.stockId}`} className="label">Sold for (UGX), private</label>
                            <input id={`s-${c.stockId}`} name="price" required inputMode="numeric" className="field tabular-nums" /></div>
                          <div><label htmlFor={`d-${c.stockId}`} className="label">Date</label>
                            <input id={`d-${c.stockId}`} name="soldOn" type="date" max={today} defaultValue={today} className="field" /></div>
                          <button className="btn btn-primary self-end">Record the sale</button>
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

      {manager && settings && (
        <section id="settings-section" className="scroll-mt-24 rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="settings">
          <h2 id="settings" className="font-display text-lg font-bold">Settings</h2>
          <form action={saveSettings} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="org" value={id} />
            <div><label htmlFor="levels" className="label">Warn me when a car has been in stock for (days)</label>
              <input id="levels" name="levels" defaultValue={settings.stockAgeAlertDays.join(', ')} className="field tabular-nums" />
              <p className="mt-1 text-xs text-muted">Up to 5 numbers, for example 90, 180, 240. These are your own business levels, not customs rules.</p></div>
            <div><label htmlFor="protection" className="label">A broker keeps a customer they bring for (days)</label>
              <input id="protection" name="protection" inputMode="numeric" defaultValue={settings.leadProtectionDays} className="field tabular-nums" /></div>
            <div className="sm:col-span-2"><label htmlFor="whatsapp" className="label">WhatsApp number for buyers</label>
              <input id="whatsapp" name="whatsapp" type="tel" defaultValue={settings.whatsappE164 ?? ''} className="field" placeholder="0772 123 456" />
              <p className="mt-1 text-xs text-muted">Shown as an &ldquo;Ask on WhatsApp&rdquo; button on the car pages you share.</p></div>
            <button className="btn btn-ghost">Save</button>
          </form>
        </section>
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
