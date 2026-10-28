// The full SAZO report inside a workspace with a side bar (option A, approved 28 Oct 2026): what buyers see on the
// car's public page down to the seven questions (the "Before you pay" card, owners' reviews and closing note are left
// off), in the space beside the side bar across its whole width. Nothing here leaves the workspace (28 Oct 2026):
// - dealers: Book an inspection (a pop-up), Compare (a view, up to 3 cars) and Save as PDF;
// - SAZO staff and Send records: Save as PDF only.
// A compared car's report opens in the same place. `base` is this workspace page's own address.
import Link from 'next/link';
import { loadVehicle } from '@/app/v/[ref]/load';
import { CarCard, CompareDetails, CompareMatrix } from '../compare/compare-tables';
import { Icon } from '../icon';
import { Popup } from '../popup';
import { PrintButton } from '../share-buttons';
import { vehicleName } from '../vehicle-card';
import { api } from '@/lib/api';
import type { CarPhoto } from '@/lib/report-data';
import type { Comparison, LedgerItem, TimelineItem } from '@/lib/types';
import { BookingForm } from './booking-form';
import { addToCompare } from './compare-actions';
import { RecordsList } from './records-list';
import { QuestionNav, ReportHero, ReportSections } from './report-view';
import { TimelineList } from './timeline-list';

export type EmbeddedReportParams = {
  view?: string; class?: string; error?: string; cmp?: string; cmpError?: string; other?: string; booked?: string; bookError?: string;
};
/** One of the dealer's own cars, for Compare: its report opens on its own page in the console. */
export type OwnCar = { ref: string; name: string; plate?: string; href: string };
const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export async function EmbeddedReport({ vehicleRef: ref, base, sp, mode = 'view', ownCars = [] }: {
  vehicleRef: string; base: string; sp: EmbeddedReportParams; mode?: 'dealer' | 'view'; ownCars?: OwnCar[];
}) {
  const dealer = mode === 'dealer';
  const VIEWS = ([['report', 'Report'], ['timeline', 'Timeline'], ['records', 'Records'], ...(dealer ? [['compare', 'Compare']] : [])] as [string, string][]);
  const at = (q: Record<string, string | undefined>) => {
    const u = new URL(base, 'http://x');
    for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
    return `${u.pathname}${u.search}`;
  };
  const view = VIEWS.some(([v]) => v === sp.view) ? sp.view! : 'report';
  const cmp = (sp.cmp ?? '').split(',').filter((r) => REF.test(r) && r !== ref).slice(0, 2);
  // A compared car's report, opened from Compare: shown here, with the way back.
  const other = view === 'report' && dealer && sp.other && REF.test(sp.other) && sp.other !== ref ? sp.other : undefined;
  const shown = other ?? ref;

  const data = await loadVehicle(shown);
  if (data.kind === 'summary') return <p className="text-muted">Only the public summary of this car is available to you.</p>;
  const r = data.report;
  const items = <T,>(p: Promise<{ items: T[] }>) => p.then((x) => x.items).catch(() => undefined);
  const [timeline, ledger, photos] = await Promise.all([
    view === 'timeline' ? items(api<{ items: TimelineItem[] }>(`/vehicles/${ref}/timeline`, { auth: true })) : Promise.resolve(undefined),
    view === 'records' || view === 'report' ? items(api<{ items: LedgerItem[] }>(`/vehicles/${shown}/evidence`, { auth: true })) : Promise.resolve(undefined),
    view === 'report' ? items(api<{ items: CarPhoto[] }>(`/vehicles/${shown}/photos`, { auth: true })) : Promise.resolve(undefined),
  ]);
  const x = { timeline, ledger, photos };
  const here = at({ view: undefined, class: undefined, error: undefined, cmp: undefined, cmpError: undefined, other: undefined, booked: undefined, bookError: undefined });

  const actions = (
    <>
      {dealer && !other && (
        <Popup title="Book an inspection" wide startOpen={!!sp.bookError} buttonClassName="btn btn-ghost" button={<><Icon name="fact_check" />Book an inspection</>}>
          <p className="mb-3 text-sm text-muted">For the {vehicleName(r.vehicle)}{r.vehicle.currentPlate ? `, ${r.vehicle.currentPlate}` : ''}. The inspector replies with a day and time, or says they cannot do it. You agree the price with them directly.</p>
          {sp.bookError && <p role="alert" className="mb-3 rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.bookError}</p>}
          <BookingForm vehicleRef={ref} plate={r.vehicle.currentPlate ?? undefined} back={here} card={false} />
        </Popup>
      )}
      {dealer && !other && <Link href={at({ view: 'compare', other: undefined, cmp: sp.cmp })} className="btn btn-ghost"><Icon name="compare_arrows" />Compare</Link>}
      <PrintButton primary />
    </>
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Report views" className="flex flex-wrap gap-2">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={at({ view: v === 'report' ? undefined : v, class: undefined, other: undefined, cmp: v === 'compare' ? sp.cmp : undefined, booked: undefined, bookError: undefined, cmpError: undefined })}
            aria-current={view === v && !other ? 'true' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${view === v && !other ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-card hover:border-primary-container'}`}>{label}</Link>
        ))}
      </nav>
      {sp.booked && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">Booking sent. The inspector replies with a day and time, and you get an SMS. It is also listed under Inspections in My SAZO.</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {view === 'timeline' && (
        <section aria-labelledby="tl-h" className="space-y-4">
          <h2 id="tl-h" className="font-display text-xl font-bold">Timeline</h2>
          {timeline ? <TimelineList items={timeline} /> : <p className="text-muted">The timeline is not available to you.</p>}
        </section>
      )}
      {view === 'records' && (
        <section aria-labelledby="rec-h">
          <h2 id="rec-h" className="font-display text-xl font-bold">Every record</h2>
          {ledger ? <RecordsList all={ledger} cls={sp.class ?? 'all'} hrefFor={(c) => at({ view: 'records', class: c === 'all' ? undefined : c })} /> : <p className="text-muted">The records are not available to you.</p>}
        </section>
      )}
      {view === 'compare' && dealer && <CompareView self={ref} cmp={cmp} sp={sp} base={base} at={at} ownCars={ownCars} />}
      {view === 'report' && (
        <>
          {other && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-soft-3 bg-soft p-3">
              <span className="font-semibold">The report for the {vehicleName(r.vehicle)}{r.vehicle.currentPlate ? `, ${r.vehicle.currentPlate}` : ''}, opened from Compare.</span>
              <Link href={at({ view: 'compare', other: undefined, cmp: sp.cmp })} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />Back to Compare</Link>
            </div>
          )}
          <ReportHero r={r} x={x} actions={actions} photoHref={(id) => `/v/${shown}/photo/${id}`} embedded />
          <QuestionNav questions={r.questions} embedded />
          <ReportSections r={r} x={x} />
          {/* Inside a workspace the report stops after the seven questions (28 Oct 2026): no "Before you pay" card,
              owners' reviews or closing note; Timeline and Records are the buttons above. */}
        </>
      )}
    </div>
  );
}

/** Compare: this car first, then up to two more from the dealer's own cars or by plate; all inside the console. */
async function CompareView({ self, cmp, sp, base, at, ownCars }: {
  self: string; cmp: string[]; sp: EmbeddedReportParams; base: string; at: (q: Record<string, string | undefined>) => string; ownCars: OwnCar[];
}) {
  const refs = [self, ...cmp];
  const c = refs.length > 1 ? await api<Comparison>(`/vehicles/compare?refs=${refs.join(',')}`, { auth: true }).catch(() => undefined) : undefined;
  const single = !c ? await loadVehicle(self).then((d) => (d.kind === 'full' ? d.report : undefined)) : undefined;
  const vehicles = c?.vehicles ?? (single ? [single] : []);
  const photos = await Promise.all(vehicles.map((v) => api<{ items: CarPhoto[] }>(`/vehicles/${v.vehicle.vehicleRef}/photos`, { auth: true }).then((x) => x.items[0]).catch(() => undefined)));
  const own = new Map(ownCars.map((o) => [o.ref, o.href]));
  const openHref = (vref: string) => (vref === self ? at({ view: undefined, cmp: undefined, cmpError: undefined }) : own.get(vref) ?? at({ view: undefined, other: vref, cmp: cmp.join(',') }));
  const choices = ownCars.filter((o) => !refs.includes(o.ref));
  return (
    <section aria-labelledby="cmp-h" className="space-y-6">
      <div>
        <h2 id="cmp-h" className="font-display text-xl font-bold">Compare</h2>
        <p className="text-sm text-muted">The same seven questions for up to three cars, from their records. This car is always first.</p>
      </div>
      {sp.cmpError && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.cmpError}</p>}
      <div className={`grid gap-4 sm:grid-cols-2 ${vehicles.length >= 2 ? 'xl:grid-cols-3' : ''}`}>
        {vehicles.map((v, i) => (
          <CarCard key={v.vehicle.vehicleRef} v={v} photo={photos[i]} open={openHref(v.vehicle.vehicleRef)}
            remove={v.vehicle.vehicleRef !== self ? at({ view: 'compare', cmp: cmp.filter((x) => x !== v.vehicle.vehicleRef).join(',') || undefined, cmpError: undefined }) : undefined} />
        ))}
        {refs.length < 3 && (
          <div className="flex flex-col rounded-[14px] border-2 border-dashed border-soft-3 bg-white/60 p-5">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-soft text-primary-container"><Icon name="add" size={28} /></span>
            <h3 className="mt-2 text-center font-display text-lg font-bold">Add a car</h3>
            <form action={addToCompare} className="mt-3 space-y-3">
              <input type="hidden" name="base" value={base} /><input type="hidden" name="self" value={self} /><input type="hidden" name="cmp" value={cmp.join(',')} />
              {choices.length > 0 && (
                <div><label htmlFor="cmp-pick" className="label">One of your cars</label>
                  <select id="cmp-pick" name="pick" className="field" defaultValue="">
                    <option value="">Choose</option>
                    {choices.map((o) => <option key={o.ref} value={o.ref}>{o.name}{o.plate ? ` · ${o.plate}` : ''}</option>)}
                  </select></div>
              )}
              <div><label htmlFor="cmp-q" className="label">{choices.length ? 'Or any car by plate, VIN or chassis number' : 'Plate, VIN or chassis number'}</label>
                <input id="cmp-q" name="q" maxLength={32} className="field sazo-id" placeholder="UBK 482M" autoComplete="off" /></div>
              <button className="btn btn-primary w-full"><Icon name="add" />Add to compare</button>
            </form>
          </div>
        )}
      </div>
      {c ? (
        <>
          <CompareMatrix c={c} />
          <CompareDetails c={c} />
        </>
      ) : <p className="text-muted">Add one or two cars to see the seven questions side by side.</p>}
    </section>
  );
}
