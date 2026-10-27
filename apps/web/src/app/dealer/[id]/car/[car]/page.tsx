import { QUESTION_TITLES, formatDate, formatKm, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { statusIcon } from '@/components/status';
import { ShareButtons } from '@/components/share-buttons';
import { AppFrame } from '@/components/app-frame/app-frame';
import { Popup } from '@/components/popup';
import { ApiError, api, isSignedIn } from '@/lib/api';
import { localPhone } from '@/lib/phone';
import type { CostEntry, Me, MyOrganisation, StockItem } from '@/lib/types';
import { shareReport } from '../../../../buyer-actions';
import { addCost, addPhotos, changePrice, createLink, linkCar, removePhoto, removeStock, revokeLink, reverseCost, setBrokerTerms, updateCar } from '../../../actions';
import { SaleForm, type BuyerChoice } from '../../../sale-form';
import { BondClock, COSTS, CUSTOMS, FUELS, GEARS, STAGES, StockAge, carName, costLabel, stageLabel } from '../../../labels';
import { PICTURE_ACCEPT } from '@/lib/upload-types';

export const metadata: Metadata = { title: 'Car', robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fileInput = 'block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary';
const money = (n: number, currency: string) => (currency === 'UGX' ? formatUgx(n, false) : `${currency} ${n.toLocaleString('en-UG', { maximumFractionDigits: 2 })}`);

function Section({ id, title, icon, children, note }: { id: string; title: string; icon: Parameters<typeof Icon>[0]['name']; children: React.ReactNode; note?: string }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-[14px] border border-line p-4 md:p-5" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="flex items-center gap-2 font-display text-lg font-bold"><Icon name={icon} />{title}</h2>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

type SP = Promise<{ done?: string; error?: string; link?: string; ch?: string }>;
interface CarLink { linkId: string; channel: string; showDealerName: boolean; createdAt: string }
const CHANNELS: [string, string][] = [['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['other', 'Somewhere else']];
const channelLabel = (c: string) => CHANNELS.find(([k]) => k === c)?.[1] ?? c;

export default async function DealerCar({ params, searchParams }: { params: Promise<{ id: string; car: string }>; searchParams: SP }) {
  const { id, car } = await params;
  const sp = await searchParams;
  if (!UUID.test(car)) notFound();
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/car/${car}`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status === 'rejected' || org.status === 'suspended') redirect(`/dealer/${id}`);
  const approved = org.status === 'approved';
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const manager = org.role === 'org_manager';
  const c = await api<StockItem>(`/dealer/stock/${car}`, as).catch((err) => { if (err instanceof ApiError && err.status === 404) notFound(); throw err; });
  const [costs, me, links, leads] = await Promise.all([
    manager ? api<{ totalUgx: number; entries: CostEntry[] }>(`/dealer/stock/${car}/costs`, as).catch(() => undefined) : Promise.resolve(undefined),
    api<Me>('/me', { auth: true }).catch(() => undefined),
    c.linked && c.status === 'in_stock' ? api<{ items: CarLink[] }>(`/dealer/stock/${car}/links`, as).then((r) => r.items).catch(() => []) : Promise.resolve([] as CarLink[]),
    manager && approved && c.status === 'in_stock'
      ? api<{ items: { leadId: string; stockId: string | null; stage: string; customer: { name: string | null; phone: string | null } }[] }>('/dealer/leads?stage=open', as).then((r) => r.items).catch(() => [])
      : Promise.resolve([]),
  ]);
  // The buyer is usually someone who asked about this car (D-146).
  const buyers: BuyerChoice[] = leads.filter((l) => l.stockId === car).map((l) => ({ leadId: l.leadId, name: l.customer.name ?? 'Customer', phone: l.customer.phone ? localPhone(l.customer.phone) : null }));
  const name = org.tradingName ?? org.legalName;
  const h = await headers();
  const newLink = sp.link && /^[A-Za-z0-9_-]{20,40}$/.test(sp.link) ? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}/c/${sp.link}` : undefined;
  const title = carName(c);
  const d = c.details;
  const live = c.status === 'in_stock';
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Kampala
  const hidden = <><input type="hidden" name="org" value={id} /><input type="hidden" name="id" value={c.stockId} /></>;

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name: name, approved }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}>
      <p><Link href={`/dealer/${id}`} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />All cars</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {c.vehicle?.currentPlate && <Plate value={c.vehicle.currentPlate} size="sm" />}
            {!c.vehicle && c.held?.plate && <Plate value={c.held.plate} size="sm" />}
            {!c.linked && <span className="chip border-line-strong bg-white text-muted">{c.heldUntilApproval ? 'Joins SAZO after approval' : c.waitingForReview ? 'SAZO is checking' : 'Plate or chassis number needed'}</span>}
            {c.vehicle?.status === 'provisional' && <span className="chip border-warn-line bg-warn-fill text-warn-text">Not yet confirmed</span>}
            {c.status !== 'in_stock' && <span className="chip border-line bg-soft text-on-surface">{c.status === 'sold' ? `Sold ${formatDate(c.soldAt)}` : 'Removed'}</span>}
          </div>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
          <p className="text-muted">{stageLabel(d.stage)}{d.yard ? `, ${d.yard}` : ''}{c.listedMileageKm !== null ? `. ${formatKm(c.listedMileageKm)}` : ''}</p>
          {live && <div className="mt-2 flex flex-wrap gap-1"><StockAge c={c} /><BondClock c={c} /></div>}
        </div>
        <div className="sm:text-right">
          <p className="font-display text-2xl font-extrabold tabular-nums">{formatUgx(c.status === 'sold' ? c.salePriceUgx! : c.askingPriceUgx)}</p>
          <p className="text-xs text-muted">{c.status === 'sold' ? 'Sold for (private)' : 'Asking price'}</p>
        </div>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {/* All the car's details beside the side bar (approved 25 Oct 2026): photos first, then what the records show and the actions. */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Section id="photos" title="Photos" icon="photo_library" note={c.photos.length ? undefined : 'No photos yet. Photos taken by your team, up to 12.'}>
          {c.photos.length > 0 ? (
            <>
              <a href={`/dealer/${id}/car/${c.stockId}/photo/${c.photos[0]!.photoId}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line">
                <img src={`/dealer/${id}/car/${c.stockId}/photo/${c.photos[0]!.photoId}`} alt={`${title}, main photo`} className="aspect-[4/3] w-full object-cover" />
              </a>
              <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {c.photos.slice(1).map((p) => (
                  <li key={p.photoId} className="relative overflow-hidden rounded-md border border-line">
                    <a href={`/dealer/${id}/car/${c.stockId}/photo/${p.photoId}`} target="_blank" rel="noopener noreferrer"><img src={`/dealer/${id}/car/${c.stockId}/photo/${p.photoId}`} alt={`${title}, photo ${p.position + 1}`} className="aspect-[4/3] w-full object-cover" /></a>
                    {live && <form action={removePhoto} className="absolute right-0.5 top-0.5">{hidden}<input type="hidden" name="photo" value={p.photoId} />
                      <button className="rounded-full bg-white/90 p-1 shadow" aria-label={`Remove photo ${p.position + 1}`}><Icon name="delete" size={14} /></button></form>}
                  </li>
                ))}
              </ul>
              {live && <form action={removePhoto} className="mt-2">{hidden}<input type="hidden" name="photo" value={c.photos[0]!.photoId} /><button className="link text-xs">Remove the main photo</button></form>}
            </>
          ) : <div className="grid aspect-[4/3] place-items-center rounded-lg bg-soft text-label"><Icon name="directions_car" size={56} /></div>}
          {live && c.photos.length < 12 && (
            <form action={addPhotos} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border-2 border-dashed border-line-strong p-3">{hidden}
              <div className="min-w-0 flex-1"><label htmlFor="newphotos" className="label">Add photos</label><input id="newphotos" name="photos" type="file" multiple accept={PICTURE_ACCEPT} className={fileInput} /></div>
              <button className="btn btn-ghost"><Icon name="photo_camera" />Add</button>
            </form>
          )}
        </Section>
        <div className="space-y-4">
          {c.linked ? (
        <Section id="records" title="What SAZO records show" icon="fact_check" note="Buyers see the same.">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {c.questions.map((x) => {
              const st = statusIcon(x.status);
              return <li key={x.question} className={`flex items-center gap-1 font-semibold ${st.cls}`}><Icon name={st.icon} size={16} />{QUESTION_TITLES[x.question]?.short}</li>;
            })}
          </ul>
          {c.vehicleRef && <p className="mt-2"><Link href={`/v/${c.vehicleRef}`} className="link text-sm">Open the full SAZO report</Link></p>}
        </Section>
          ) : (
            <Section id="records" title="What SAZO records show" icon="fact_check">
              <p className="text-sm text-muted">{c.heldUntilApproval ? 'Private until SAZO approves your business. Then the car joins SAZO by itself and its records show here.' : c.waitingForReview ? 'SAZO is checking which car this is. Its records show here once that is done.' : 'Add the plate or chassis number to see what SAZO records show.'}</p>
            </Section>
          )}
          {manager && costs && (
            <section className="rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="cost-sum-h">
              <h2 id="cost-sum-h" className="flex items-center gap-2 font-display text-lg font-bold"><Icon name="receipt_long" />Costs so far</h2>
              <p className="mt-2 font-display text-2xl font-extrabold tabular-nums">{formatUgx(costs.totalUgx)}</p>
              <p className="text-sm"><a href="#costs" className="link">See every cost</a></p>
            </section>
          )}
        </div>
      </div>

      {live && (
        <div className="flex flex-wrap gap-2">
          {c.vehicleRef && <form action={shareReport}><input type="hidden" name="ref" value={c.vehicleRef} />
            <button className="btn btn-primary"><Icon name="share" />Report link for a buyer</button></form>}
          <details className="w-full sm:w-auto">
            <summary className="btn btn-ghost w-full cursor-pointer list-none bg-white">Change price</summary>
            <form action={changePrice} className="mt-2 flex gap-2">{hidden}<input type="hidden" name="from" value="car" />
              <label htmlFor="newprice" className="sr-only">New asking price (UGX)</label>
              <input id="newprice" name="price" required inputMode="numeric" className="field tabular-nums" placeholder="UGX" />
              <button className="btn btn-ghost">Save</button>
            </form>
          </details>
          {approved && (
            <Popup title="Mark as sold" button="Mark as sold" buttonClassName="btn btn-ghost w-full bg-white sm:w-auto">
              <p className="mb-3 text-sm text-muted">{title} · asking {formatUgx(c.askingPriceUgx, false)}</p>
              <SaleForm org={id} carId={c.stockId} askingPriceUgx={c.askingPriceUgx} today={today} manager={manager} buyers={buyers} mode="sell" />
            </Popup>
          )}
          <form action={removeStock}>{hidden}<button className="btn btn-ghost w-full bg-white" aria-label={`Remove ${title} without a sale`}><Icon name="delete" />Remove</button></form>
        </div>
      )}

      {live && c.linked && (
        <Section id="share" title="Share the car" icon="share" note="Make a link for WhatsApp, TikTok or Facebook. It opens a page with the photos, the price and what SAZO records show, and buyers can ask about the car there.">
          {newLink && (
            <div className="mb-4 rounded-lg border border-ok-line bg-ok-fill p-3" role="status">
              <p className="font-semibold text-ok-text">Your {channelLabel(sp.ch ?? 'other')} link is ready</p>
              <p className="sazo-id mt-2 break-all rounded bg-white p-2 text-sm normal-case tracking-normal">{newLink}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a className="btn btn-primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${title} for ${formatUgx(c.askingPriceUgx, false)}. See the photos and its SAZO history: ${newLink}`)}`}><Icon name="chat" />Send on WhatsApp</a>
                <ShareButtons url={newLink} title={title} />
              </div>
              {sp.ch === 'tiktok' && <p className="mt-2 text-sm">Paste the link in your TikTok video description or your profile.</p>}
            </div>
          )}
          <form action={createLink} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">{hidden}
            <div><label htmlFor="channel" className="label">Where will you share it?</label>
              <select id="channel" name="channel" className="field" defaultValue="whatsapp">{CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <button className="btn btn-primary"><Icon name="add_link" />Make a link</button>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="showDealerName" defaultChecked className="size-5" />Show {name} on the page</label>
          </form>
          {links.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line text-sm" aria-label="Links in use">
              {links.map((l) => (
                <li key={l.linkId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{channelLabel(l.channel)} link, made {formatDate(l.createdAt)}{l.showDealerName ? '' : ', without your name'}</span>
                  <form action={revokeLink}>{hidden}<input type="hidden" name="link" value={l.linkId} /><button className="link text-sm">Stop this link</button></form>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm"><Link href={`/dealer/${id}/enquiries`} className="link">See enquiries</Link></p>
        </Section>
      )}

      {live && !c.linked && c.waitingForReview && (
        <Section id="link" title="SAZO is checking this car" icon="hourglass_empty" note="The plate or chassis number matches a car SAZO has not confirmed yet, so a SAZO reviewer checks which car it is. The car joins SAZO by itself once that is done. You can keep selling it meanwhile.">
          <p className="text-sm text-muted">Nothing to do for now.</p>
        </Section>
      )}

      {live && !c.linked && (c.heldUntilApproval || !approved) && (
        <Section id="link" title="Joins SAZO once your business is approved" icon="hourglass_empty" note="While SAZO checks your business, this car stays private to you: buyers, brokers and the car's history do not see it yet.">
          {c.heldUntilApproval
            ? <p className="text-sm">{[c.held?.plate && `Plate ${c.held.plate}`, c.held?.chassisNumber && `chassis number ${c.held.chassisNumber}`, c.held?.mileageKm != null && formatKm(c.held.mileageKm)].filter(Boolean).join(', ')}. Sent to SAZO by itself once your business is approved.</p>
            : <p className="text-sm text-muted">Add the plate or chassis number once your business is approved. <Link href={`/business/${id}`} className="link">Finish the approval steps</Link>.</p>}
        </Section>
      )}

      {live && approved && !c.linked && !c.waitingForReview && !c.heldUntilApproval && (
        <Section id="link" title="Add the plate or chassis number" icon="add_link" note="Once added, the car and its asking price join SAZO, even if SAZO did not know the car before, and buyers and brokers can see it.">
          <form action={linkCar} data-draft={`car-link-${car}`} className="grid gap-3 sm:grid-cols-2">{hidden}
            <div><label htmlFor="anchor" className="label">Chassis number or VIN</label><input id="anchor" name="anchor" className="field sazo-id" autoCapitalize="characters" autoComplete="off" /></div>
            <div><label htmlFor="plate" className="label">Number plate</label><input id="plate" name="plate" className="field sazo-id" autoCapitalize="characters" autoComplete="off" /></div>
            <div><label htmlFor="mileage" className="label">Mileage now (km)</label><input id="mileage" name="mileage" inputMode="numeric" className="field tabular-nums" /></div>
            <div><label htmlFor="odometer" className="label">Odometer photo (needed with a mileage)</label><input id="odometer" name="odometer" type="file" accept={PICTURE_ACCEPT} capture="environment" className={fileInput} /></div>
            <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="add_link" />Link to SAZO</button></div>
          </form>
        </Section>
      )}



      <Section id="details" title="About the car" icon="directions_car">
        <form action={updateCar} data-draft={`car-details-${car}`} className="grid gap-3 sm:grid-cols-2">{hidden}<input type="hidden" name="at" value="details" />
          <div><label htmlFor="make" className="label">Make</label><input id="make" name="make" defaultValue={d.make ?? ''} className="field" disabled={!live} /></div>
          <div><label htmlFor="model" className="label">Model</label><input id="model" name="model" defaultValue={d.model ?? ''} className="field" disabled={!live} /></div>
          <div><label htmlFor="modelYear" className="label">Year</label><input id="modelYear" name="modelYear" inputMode="numeric" defaultValue={d.modelYear ?? ''} className="field tabular-nums" disabled={!live} /></div>
          <div><label htmlFor="engineCc" className="label">Engine (cc)</label><input id="engineCc" name="engineCc" inputMode="numeric" defaultValue={d.engineCc ?? ''} className="field tabular-nums" disabled={!live} /></div>
          <div><label htmlFor="fuel" className="label">Fuel</label><select id="fuel" name="fuel" defaultValue={d.fuel ?? ''} className="field" disabled={!live}><option value="">Not given</option>{FUELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label htmlFor="transmission" className="label">Gearbox</label><select id="transmission" name="transmission" defaultValue={d.transmission ?? ''} className="field" disabled={!live}><option value="">Not given</option>{GEARS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label htmlFor="colour" className="label">Colour</label><input id="colour" name="colour" defaultValue={d.colour ?? ''} className="field" disabled={!live} /></div>
          <div><label htmlFor="stage" className="label">Where is it now?</label><select id="stage" name="stage" defaultValue={d.stage} className="field" disabled={!live}>{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label htmlFor="yard" className="label">Bond or yard</label><input id="yard" name="yard" defaultValue={d.yard ?? ''} className="field" disabled={!live} /></div>
          <div><label htmlFor="receivedOn" className="label">Date you took the car on</label><input id="receivedOn" name="receivedOn" type="date" max={today} defaultValue={d.receivedOn ?? ''} className="field" disabled={!live} />
            <p className="mt-1 text-xs text-muted">Days in stock count from this date.</p></div>
          <div className="sm:col-span-2"><label htmlFor="tiktokUrl" className="label">TikTok video link</label><input id="tiktokUrl" name="tiktokUrl" type="url" defaultValue={d.tiktokUrl ?? ''} placeholder="https://www.tiktok.com/@yourbond/video/..." className="field" disabled={!live} /></div>
          {live && <div className="sm:col-span-2"><button className="btn btn-ghost">Save</button></div>}
        </form>
      </Section>

      <Section id="bond" title="Customs bond" icon="inventory_2" note="Enter the deadline that applies to this car as you were told by customs or your clearing agent. SAZO does not set one for you.">
        <form action={updateCar} data-draft={`car-bond-${car}`} className="grid gap-3 sm:grid-cols-2">{hidden}<input type="hidden" name="at" value="bond" />
          <div><label htmlFor="customsStatus" className="label">Customs status</label><select id="customsStatus" name="customsStatus" defaultValue={d.customsStatus ?? ''} className="field" disabled={!live}><option value="">Not given</option>{CUSTOMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label htmlFor="bondArrivedOn" className="label">Arrived at the bond</label><input id="bondArrivedOn" name="bondArrivedOn" type="date" max={today} defaultValue={d.bondArrivedOn ?? ''} className="field" disabled={!live} /></div>
          <div><label htmlFor="customsDeadline" className="label">Bond deadline</label><input id="customsDeadline" name="customsDeadline" type="date" defaultValue={d.customsDeadline ?? ''} className="field" disabled={!live} /></div>
          <div><label htmlFor="customsExtensionUntil" className="label">Approved extension until</label><input id="customsExtensionUntil" name="customsExtensionUntil" type="date" defaultValue={d.customsExtensionUntil ?? ''} className="field" disabled={!live} /></div>
          {manager && <div className="sm:col-span-2"><label htmlFor="customsValue" className="label">Customs value set by URA (UGX)</label><input id="customsValue" name="customsValue" inputMode="numeric" defaultValue={d.customsValueUgx ?? ''} className="field tabular-nums" disabled={!live} />
            <p className="mt-1 text-xs text-muted"><Icon name="lock" size={12} className="mr-1 inline align-[-1px]" />Managers only. Kept apart from your costs; it is not an official tax figure from SAZO.</p></div>}
          {live && <div className="sm:col-span-2"><button className="btn btn-ghost">Save</button></div>}
        </form>
      </Section>

      <Section id="brokers" title="Brokers" icon="handshake" note="Brokers share cars with their buyers. They see the photos, the car and the asking price, never your costs or customers.">
        {manager ? (
          <form action={setBrokerTerms} data-draft={`car-brokers-${car}`} className="grid gap-3 sm:grid-cols-2">{hidden}
            <label className="flex items-center gap-2 font-semibold sm:col-span-2"><input type="checkbox" name="openToBrokers" defaultChecked={d.openToBrokers} className="size-5" disabled={!live} />Open to brokers</label>
            <div><label htmlFor="commissionKind" className="label">Commission</label><select id="commissionKind" name="commissionKind" defaultValue={d.commissionKind ?? ''} className="field" disabled={!live}>
              <option value="">Not set yet</option><option value="fixed">A fixed amount</option><option value="percent">A percentage of the selling price</option></select></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label htmlFor="commissionFixed" className="label">Amount (UGX)</label><input id="commissionFixed" name="commissionFixed" inputMode="numeric" defaultValue={d.commissionFixedUgx ?? ''} className="field tabular-nums" placeholder="500,000" disabled={!live} /></div>
              <div><label htmlFor="commissionPercent" className="label">Percent</label><input id="commissionPercent" name="commissionPercent" inputMode="decimal" defaultValue={d.commissionPercent ?? ''} className="field tabular-nums" placeholder="1" disabled={!live} /></div>
            </div>
            <p className="text-xs text-muted sm:col-span-2">Brokers see a car only when it is open to brokers, linked to SAZO and has a commission set.</p>
            {live && <div className="sm:col-span-2"><button className="btn btn-ghost">Save</button></div>}
          </form>
        ) : (
          <p className="text-sm">{d.openToBrokers ? 'Open to brokers' : 'Not open to brokers'}. {d.commissionKind === 'fixed' ? `Commission ${formatUgx(d.commissionFixedUgx!)}.` : d.commissionKind === 'percent' ? `Commission ${d.commissionPercent}% of the selling price.` : 'No commission set yet. A manager sets it.'}</p>
        )}
      </Section>

      {manager && costs && (
        <Section id="costs" title="Costs" icon="receipt_long" note="Managers only. Each cost keeps its own currency and the rate you used. To correct one, cancel it and add it again: both entries stay.">
          {costs.entries.length > 0 && (
            <ul className="divide-y divide-line border-y-2 border-line-strong" aria-label="Cost entries">
              {costs.entries.map((e) => (
                <li key={e.id} className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 text-sm ${e.reversedBy || e.reversesEntryId ? 'text-muted' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${e.reversedBy ? 'line-through' : ''}`}>{e.reversesEntryId ? `Cancelled: ${costLabel(e.category)}` : costLabel(e.category)}</p>
                    <p className="text-xs text-muted">{formatDate(e.createdAt)}{e.note ? `. ${e.note}` : ''}{e.shareRule ? `. Shared cost: ${e.shareRule}` : ''}</p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-semibold">{e.reversesEntryId ? `minus ${formatUgx(e.amountUgx, false)}` : formatUgx(e.amountUgx, false)}</p>
                    {e.currency !== 'UGX' && <p className="text-xs text-muted">{money(e.amount, e.currency)} at {e.rateToUgx.toLocaleString('en-UG')} UGX</p>}
                  </div>
                  {live && !e.reversedBy && !e.reversesEntryId && (
                    <details className="w-full"><summary className="cursor-pointer text-sm font-semibold text-primary">Cancel this cost</summary>
                      <form action={reverseCost} className="mt-2 flex gap-2">{hidden}<input type="hidden" name="entry" value={e.id} />
                        <label htmlFor={`r-${e.id}`} className="sr-only">Why is this cost being cancelled?</label>
                        <input id={`r-${e.id}`} name="reason" required minLength={3} placeholder="Why?" className="field !min-h-10 text-sm" />
                        <button className="btn btn-ghost !min-h-10">Cancel it</button>
                      </form></details>)}
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-4 py-2"><span className="font-bold">Landed cost</span><span className="font-display text-lg font-extrabold tabular-nums">{formatUgx(costs.totalUgx, false)}</span></li>
            </ul>
          )}
          <p className="mt-2 text-sm">{c.status === 'sold' && c.marginUgx !== null && c.marginUgx !== undefined
            ? <>Margin on the sale: <strong className="tabular-nums">{formatUgx(c.marginUgx, false)}</strong></>
            : costs.totalUgx > 0 ? <>At the asking price the margin would be <strong className="tabular-nums">{formatUgx(c.askingPriceUgx - costs.totalUgx, false)}</strong></> : 'No costs recorded yet.'}</p>
          {live ? (
            <form action={addCost} data-draft={`car-cost-${car}`} className="mt-3 grid gap-3 rounded-lg bg-soft/50 p-3 sm:grid-cols-2">{hidden}
              <div className="sm:col-span-2"><label htmlFor="category" className="label">What was it for?</label><select id="category" name="category" className="field">{COSTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div><label htmlFor="amount" className="label">Amount</label><input id="amount" name="amount" required inputMode="decimal" className="field tabular-nums" /></div>
                <div><label htmlFor="currency" className="label">Currency</label><select id="currency" name="currency" className="field" defaultValue="UGX">{['UGX', 'USD', 'JPY', 'KES', 'TZS', 'AED', 'GBP', 'EUR'].map((x) => <option key={x}>{x}</option>)}</select></div>
              </div>
              <div><label htmlFor="rate" className="label">Rate to UGX (if not UGX)</label><input id="rate" name="rate" inputMode="decimal" className="field tabular-nums" placeholder="For example 3,700 for USD" /></div>
              <div><label htmlFor="note" className="label">Note</label><input id="note" name="note" maxLength={300} className="field" placeholder="Receipt number, agent name" /></div>
              <div><label htmlFor="shareRule" className="label">If shared with other cars, how it was split</label><input id="shareRule" name="shareRule" maxLength={200} className="field" placeholder="Split equally across 4 cars in the container" /></div>
              <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="add" />Add the cost</button></div>
            </form>
          ) : <p className="mt-2 text-sm text-muted">Costs can no longer change after the car is sold or removed.</p>}
        </Section>
      )}
    </AppFrame>
  );
}
