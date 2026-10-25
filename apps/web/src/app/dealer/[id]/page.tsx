import { formatDate, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { DealerSettings, Me, MyOrganisation, StaffMember, StockItem } from '@/lib/types';
import { AppFrame } from '@/components/app-frame/app-frame';
import { addStaff, addStock, saveSettings } from '../actions';
import { FUELS, STAGES, carName, stageLabel } from '../labels';

export const metadata: Metadata = { title: 'Cars for sale', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string; show?: string; findings?: string; q?: string; add?: string; new?: string }>;

export default async function DealerStock({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  const name = org.tradingName ?? org.legalName;
  if (org.status === 'rejected' || org.status === 'suspended') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
        <h1 className="font-display text-2xl font-bold">{name}</h1>
        <p className="card mt-4 p-4">{org.status === 'rejected' ? 'SAZO did not approve this business.' : 'This business is suspended.'} <Link href={`/business/${id}`} className="link">See the details</Link>.</p>
      </div>
    );
  }
  // Waiting for approval (25 Oct 2026): the dealer prepares stock privately; nothing reaches SAZO or buyers yet.
  const approved = org.status === 'approved';
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const show = sp.show === 'sold' ? 'sold' : 'in_stock';
  const onlyFindings = sp.findings === '1';
  const q = (sp.q ?? '').replace(/\s/g, '').toUpperCase();
  const manager = org.role === 'org_manager';
  const [inStock, soldList, staff, me, settings] = await Promise.all([
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items),
    api<{ items: StockItem[] }>('/dealer/stock?status=sold', as).then((r) => r.items),
    org.role === 'org_manager' && approved ? api<StaffMember[]>('/garage/staff', as).catch((err) => { if (err instanceof ApiError) return []; throw err; }) : Promise.resolve(undefined),
    api<Me>('/me', { auth: true }).catch(() => undefined),
    api<DealerSettings>('/dealer/settings', as).catch(() => undefined),
  ]);
  const findings = (c: StockItem) => ({ serious: c.questions.filter((x) => x.status === 'serious').length, attention: c.questions.filter((x) => x.status === 'attention').length });
  const flagged = inStock.filter((c) => findings(c).serious > 0);
  const bondUrgent = inStock.filter((c) => c.clocks.bond.level === 'soon' || c.clocks.bond.level === 'overdue');
  const base = show === 'sold' ? soldList : inStock;
  const items = base.filter((c) => (!onlyFindings || findings(c).serious + findings(c).attention > 0)
    && (!q || (c.vehicle?.currentPlate ?? '').replace(/\s/g, '').toUpperCase().includes(q) || carName(c).replace(/\s/g, '').toUpperCase().includes(q)));
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ show: show === 'sold' ? 'sold' : undefined, findings: onlyFindings ? '1' : undefined, q: sp.q || undefined, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/dealer/${id}${p.size ? `?${p}` : ''}`;
  };

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name: name, approved }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}
      badges={{ stock: inStock.length, sold: soldList.length, ...(staff ? { team: staff.length } : {}) }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name}: cars for sale</h1>
          <p className="mt-1 max-w-2xl text-muted">Add your cars, follow their import costs and bond deadlines, and send buyers a link with each car&apos;s SAZO history.</p>
        </div>
        {sp.add !== '1' && <Link href={`/dealer/${id}?add=1`} className="btn btn-focal shrink-0"><Icon name="add" />Add a car</Link>}
      </div>
      {!approved && (
        <section aria-labelledby="waiting" className="rounded-[14px] border-2 border-warn-line bg-warn-fill p-3 shadow-sm md:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Icon name="hourglass_empty" size={20} className="mt-0.5 shrink-0 text-warn-text" />
              <div className="min-w-0">
                <h2 id="waiting" className="font-bold text-warn-text">{sp.new ? 'Registered. ' : ''}SAZO is checking your business</h2>
                <p className="text-sm text-on-surface">Your cars stay private until approval.</p>
              </div>
            </div>
            <Link href={`/business/${id}`} className="btn btn-primary !min-h-10 w-full shrink-0 !px-3 text-sm sm:w-auto">Finish the approval steps<Icon name="arrow_forward" size={16} /></Link>
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-semibold text-primary-container">What can I do meanwhile?</summary>
            <p className="mt-1 text-on-surface">Add your cars, their import costs and photos. Once SAZO approves your business, each car with a plate or chassis number joins SAZO by itself, and you can send buyers report links, record sales, work with brokers and add your team.</p>
          </details>
        </section>
      )}
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

      {sp.add === '1' ? (
        <section aria-labelledby="add-h" className="space-y-3">
          <p><Link href={`/dealer/${id}`} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />All cars</Link></p>
          <h2 id="add-h" className="font-display text-xl font-bold">Add a car</h2>
          <p className="text-sm text-muted">Start with the basics. You can add import costs and more photos later.{manager && approved && <> Many cars at once? <Link href={`/dealer/${id}/import`} className="link">Add them from an Excel file</Link>.</>}</p>
          <div className="rounded-[14px] border border-line bg-card p-4 md:p-5">
            <form action={addStock} data-draft={`stock-new-${id}`} className="mt-3 grid gap-3 sm:grid-cols-2">
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
                <p className="mt-1 text-sm text-muted">{approved ? 'With the plate or the chassis number the car joins SAZO at once, even if SAZO does not know it yet.' : 'Kept private for now. With the plate or the chassis number the car joins SAZO by itself once your business is approved.'}</p></div>
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
          </div>
        </section>
      ) : (<>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter" className="flex overflow-hidden rounded-lg border border-line-strong text-sm font-semibold">
          {([['in_stock', 'For sale', inStock.length], ['sold', 'Sold', soldList.length]] as const).filter(([s]) => approved || s === 'in_stock').map(([s, label, n], i) => (
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

      {items.length === 0 ? <p className="rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">{q || onlyFindings ? 'No cars match.' : show === 'sold' ? 'No sales recorded yet.' : <>No cars for sale yet. <Link href={`/dealer/${id}?add=1`} className="link">Add a car</Link>.</>}</p> : (
        <div>
          <div aria-hidden className="hidden items-center gap-4 px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-label md:flex">
            <span className="w-24" /><span className="flex-[1.6]">Car</span><span className="flex-1">What SAZO records show</span><span className="flex-[0.8] text-right">{show === 'sold' ? 'Sold for' : 'Asking price'}</span><span className="w-5" />
          </div>
          {/* The list only (approved 25 Oct 2026): a car opens with all its details beside the side bar. */}
          <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card" aria-label={show === 'sold' ? 'Cars sold' : 'Cars for sale'}>
            {items.map((c) => {
              const v = c.vehicle;
              const plate = v?.currentPlate ?? c.held?.plate ?? undefined;
              const f = findings(c);
              const photo = c.photos[0];
              const status = c.heldUntilApproval ? ['Joins SAZO after approval', 'text-muted'] : c.waitingForReview ? ['SAZO is checking which car this is', 'text-muted']
                : !c.linked ? ['Plate or chassis number needed', 'text-muted'] : f.serious ? [`${f.serious} serious`, 'text-bad-text']
                : f.attention ? [`${f.attention} to check`, 'text-warn-text'] : ['Nothing flagged', 'text-ok-text'];
              return (
                <li key={c.stockId}>
                  <Link href={`/dealer/${id}/car/${c.stockId}`} className={`flex items-center gap-3 px-3 py-3 hover:bg-soft md:gap-4 md:px-4 ${f.serious ? 'bg-bad-fill/30' : ''}`}>
                    {photo
                      ? <img src={`/dealer/${id}/car/${c.stockId}/photo/${photo.photoId}`} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
                      : <span aria-hidden className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-soft text-label"><Icon name="directions_car" size={28} /></span>}
                    <span className="min-w-0 flex-[1.6]">
                      {plate && <Plate value={plate} size="sm" />}
                      <span className="mt-1 block font-display font-bold">{carName(c)}</span>
                      <span className="block truncate text-xs text-muted">{stageLabel(c.details.stage)}{c.details.yard ? `, ${c.details.yard}` : ''}</span>
                      <span className={`mt-0.5 block text-xs font-semibold md:hidden ${status[1]}`}>{status[0]}</span>
                    </span>
                    <span className={`hidden flex-1 text-sm font-semibold md:block ${status[1]}`}>{status[0]}</span>
                    <span className="flex-[0.8] text-right">
                      <span className="block font-display font-extrabold tabular-nums">{formatUgx(c.status === 'sold' ? c.salePriceUgx! : c.askingPriceUgx)}</span>
                      <span className="block text-xs text-muted">{c.status === 'sold' ? `Sold ${formatDate(c.soldAt)}` : `${c.clocks.daysInStock} ${c.clocks.daysInStock === 1 ? 'day' : 'days'}`}</span>
                    </span>
                    <Icon name="chevron_right" size={20} className="shrink-0 text-label" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-sm text-muted">Open a car to see all its details, photos, costs and actions.</p>
        </div>
      )}
      </>)}

      {manager && settings && (
        <section id="settings-section" className="scroll-mt-24 rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="settings">
          <h2 id="settings" className="font-display text-lg font-bold">Settings</h2>
          <form action={saveSettings} data-draft={`dealer-settings-${id}`} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
          <form action={addStaff} data-draft={`dealer-staff-${id}`} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <input type="hidden" name="org" value={id} />
            <div><label htmlFor="sname" className="label">Name</label><input id="sname" name="name" required className="field" /></div>
            <div><label htmlFor="sphone" className="label">Phone</label><input id="sphone" name="phone" type="tel" required className="field" placeholder="0772 123 456" /></div>
            <div><label htmlFor="srole" className="label">Role</label><select id="srole" name="role" className="field"><option value="org_staff">Sales</option><option value="org_manager">Manager</option></select></div>
            <button className="btn btn-ghost"><Icon name="add" />Add</button>
          </form>
        </section>
      )}
    </AppFrame>
  );
}
