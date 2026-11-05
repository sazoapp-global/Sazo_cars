import { CAR_CATEGORIES, CAR_CATEGORY_LABELS, KIND_LABELS, VEHICLE_KINDS, formatDate, formatUgx, isCarCategory, isVehicleKind } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation, StaffMember, StockItem } from '@/lib/types';
import { AppFrame } from '@/components/app-frame/app-frame';
import { addStock } from '../actions';
import { FUELS, STAGES, carName, stageLabel } from '../labels';
import { PICTURE_ACCEPT } from '@/lib/upload-types';
import { KindField, MoreDetails } from '../car-kind-fields';
import { StockFilters } from '../stock-filters';
import { CategoryField } from '../category-field';
import { Pager, pageHref, paginate } from '@/components/pager';
import { BackButton } from '@/components/back-button';

export const metadata: Metadata = { title: 'Cars for sale', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string; show?: string; cat?: string; q?: string; add?: string; new?: string; kind?: string; page?: string }>;

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
  // D-163: the category tabs (New, Imported used, Ugandan used); Has findings is gone: findings show in the list and under Alerts.
  const cat = isCarCategory(sp.cat) ? sp.cat : undefined;
  const q = (sp.q ?? '').replace(/\s/g, '').toUpperCase();
  const manager = org.role === 'org_manager';
  const [inStock, soldList, staff, me] = await Promise.all([
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items),
    api<{ items: StockItem[] }>('/dealer/stock?status=sold', as).then((r) => r.items),
    org.role === 'org_manager' && approved ? api<StaffMember[]>('/garage/staff', as).catch((err) => { if (err instanceof ApiError) return []; throw err; }) : Promise.resolve(undefined),
    api<Me>('/me', { auth: true }).catch(() => undefined),
  ]);
  const findings = (c: StockItem) => ({ serious: c.questions.filter((x) => x.status === 'serious').length, attention: c.questions.filter((x) => x.status === 'attention').length });
  const base = show === 'sold' ? soldList : inStock;
  // D-148: the kind of car the dealer recorded, or the one SAZO's report shows.
  const kindOf = (c: StockItem) => c.details.kind ?? c.vehicle?.kind;
  const kindFilter = isVehicleKind(sp.kind) ? sp.kind : undefined;
  const matches = (c: StockItem) => !q || [c.vehicle?.currentPlate, c.held?.plate, c.held?.chassisNumber, carName(c)].some((t) => (t ?? '').replace(/\s/g, '').toUpperCase().includes(q));
  const searched = base.filter((c) => (!kindFilter || kindOf(c) === kindFilter) && matches(c));
  const items = searched.filter((c) => !cat || c.details.category === cat);
  const paged = paginate(items, sp.page);
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ show: show === 'sold' ? 'sold' : undefined, cat, q: sp.q || undefined, kind: kindFilter, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/dealer/${id}${p.size ? `?${p}` : ''}`;
  };

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name: name, approved }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}
      badges={{ stock: inStock.length, sold: soldList.length, ...(staff ? { team: staff.length } : {}) }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name}: {show === 'sold' ? 'cars sold' : 'cars for sale'}</h1>
          <p className="mt-1 max-w-2xl text-muted">{show === 'sold' ? 'Every car you have sold, with what it sold for and when.'
            : <>Add your cars, follow their import costs and bond deadlines, and send buyers a link with each car&apos;s SAZO history.</>}</p>
        </div>
        {sp.add !== '1' && show !== 'sold' && <Link href={`/dealer/${id}?add=1`} className="btn btn-focal shrink-0"><Icon name="add" />Add a car</Link>}
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

      {/* Serious findings and bond deadlines are listed under Alerts in the side bar (4 Nov 2026). */}

      {sp.add === '1' ? (
        <section aria-labelledby="add-h" className="space-y-3">
          <p><BackButton href={`/dealer/${id}`} /></p>
          <h2 id="add-h" className="font-display text-xl font-bold">Add a car</h2>
          <p className="text-sm text-muted">Start with the basics. You can add import costs and more photos later.{manager && approved && <> Many cars at once? <Link href={`/dealer/${id}/import`} className="link">Add them from an Excel file</Link>.</>}</p>
          <div className="rounded-[14px] border border-line bg-card p-4 md:p-5">
            <form action={addStock} data-draft={`stock-new-${id}`} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="org" value={id} />
              <CategoryField />
              <div className="sm:col-span-2"><label htmlFor="photos" className="label">Photos of the car</label>
                <input id="photos" name="photos" type="file" multiple accept={PICTURE_ACCEPT} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
              <div><label htmlFor="make" className="label">Make</label><input id="make" name="make" className="field" placeholder="Toyota" autoComplete="off" /></div>
              <div><label htmlFor="model" className="label">Model</label><input id="model" name="model" className="field" placeholder="Harrier" autoComplete="off" /></div>
              <div><label htmlFor="modelYear" className="label">Year</label><input id="modelYear" name="modelYear" inputMode="numeric" maxLength={4} className="field tabular-nums" placeholder="2018" /></div>
              <KindField />
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
              <MoreDetails />
              <div className="sm:col-span-2"><label htmlFor="notes" className="label">Notes for your team (not shown to buyers)</label><input id="notes" name="notes" maxLength={500} className="field" />
                <p className="mt-1 text-xs text-muted"><Icon name="lock" size={12} className="mr-1 inline align-[-1px]" />Private</p></div>
              <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="add" />Add the car</button></div>
            </form>
          </div>
        </section>
      ) : (<>
      {/* Sold has its own page in the side bar (5 Nov 2026): no For sale / Sold switch here. */}
      <div className="space-y-3">
        <nav aria-label="Category" className="grid w-full grid-cols-2 gap-1 rounded-xl border border-line-strong bg-card p-1 text-sm font-semibold sm:flex sm:w-fit">
          {([undefined, ...CAR_CATEGORIES] as const).map((k) => {
            const n = base.filter((c) => !k || c.details.category === k).length;
            const on = k === cat;
            return (
              <Link key={k ?? 'all'} href={href({ cat: k, page: undefined })} scroll={false} aria-current={on ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-center ${on ? 'bg-primary-container text-white' : 'text-ink hover:bg-soft'}`}>
                {k ? CAR_CATEGORY_LABELS[k] : 'All'} <span className={on ? 'text-white/80' : 'text-muted'}>{n}</span>
              </Link>
            );
          })}
        </nav>
        <StockFilters kinds={VEHICLE_KINDS.filter((k) => base.some((c) => kindOf(c) === k) || k === kindFilter)} />
        {sp.q && <p role="status" className="text-sm text-muted"><b className="text-on-surface">{items.length} {items.length === 1 ? 'car' : 'cars'}</b> {items.length === 1 ? 'matches' : 'match'} &ldquo;{sp.q}&rdquo;. The list changes as you type.</p>}
      </div>

      {items.length === 0 ? <p className="rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">{q || kindFilter ? 'No cars match.' : cat ? `No ${CAR_CATEGORY_LABELS[cat].toLowerCase()} cars ${show === 'sold' ? 'sold yet' : 'for sale'}.` : show === 'sold' ? 'No sales recorded yet.' : <>No cars for sale yet. <Link href={`/dealer/${id}?add=1`} className="link">Add a car</Link>.</>}</p> : (
        <div>
          <div aria-hidden className="hidden items-center gap-4 px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-label md:flex">
            <span className="w-24" /><span className="flex-[1.6]">Car</span><span className="flex-1">What SAZO records show</span><span className="flex-[0.8] text-right">{show === 'sold' ? 'Sold for' : 'Asking price'}</span><span className="w-5" />
          </div>
          {/* The list only (approved 25 Oct 2026): a car opens with all its details beside the side bar. */}
          <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card" aria-label={show === 'sold' ? 'Cars sold' : 'Cars for sale'}>
            {paged.items.map((c) => {
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
                      <span className="block truncate text-xs text-muted">{c.details.category ? `${CAR_CATEGORY_LABELS[c.details.category]} · ` : ''}{kindOf(c) ? `${KIND_LABELS[kindOf(c)!]} · ` : ''}{stageLabel(c.details.stage)}{c.details.yard ? `, ${c.details.yard}` : ''}</span>
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
          <Pager paged={paged} href={pageHref(`/dealer/${id}`, { show: show === 'sold' ? 'sold' : undefined, cat, q: sp.q || undefined, kind: kindFilter })} noun={show === 'sold' ? 'cars sold' : 'cars for sale'} />
          <p className="mt-2 text-sm text-muted">Open a car to see all its details, photos, costs and actions.</p>
        </div>
      )}
      </>)}

    </AppFrame>
  );
}
