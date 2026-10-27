import { CONFIDENCE_LABELS, QUESTION_ORDER, QUESTION_TITLES, factValue, kindLabel, statusLabel, summaryLine } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ConcernNotices, DealerBalanceNote } from '@/components/concern-notices';
import { Icon } from '@/components/icon';
import { ModelCommunity } from '@/components/model-community';
import { Plate } from '@/components/plate';
import { NegotiateCard, QuestionNav, ReportHero, ReportSections } from '@/components/report/report-view';
import { StatusChip } from '@/components/status';
import { Banner, vehicleName } from '@/components/vehicle-card';
import { api } from '@/lib/api';
import { QUESTION_ICONS } from '@/lib/questions';
import type { CarPhoto } from '@/lib/report-data';
import type { LedgerItem, MyCar, Summary, TimelineItem } from '@/lib/types';
import { PrintButton } from '@/components/share-buttons';
import { saveCar, shareReport, unsaveCar } from '../../buyer-actions';
import { claimCar } from '../../my-cars/actions';
import { loadVehicle } from './load';

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ error?: string; cdone?: string; cerror?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Vehicle ${ref}`, robots: { index: false } };
}

export default async function VehiclePage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { error, cdone, cerror } = await searchParams;
  const data = await loadVehicle(ref);
  if (data.kind === 'summary') return <PublicSummary s={data.summary} vref={ref} />;

  const r = data.report;
  const items = <T,>(p: Promise<{ items: T[] }>) => p.then((x) => x.items).catch(() => undefined);
  const [saved, mine, timeline, ledger, photos] = await Promise.all([
    api<{ saved: boolean }>(`/me/saved-checks/${ref}`, { auth: true }).then((x) => x.saved).catch(() => false),
    api<{ items: MyCar[] }>('/me/cars', { auth: true }).then((x) => x.items.find((c) => c.vehicleRef === ref && c.status !== 'rejected')).catch(() => undefined),
    items(api<{ items: TimelineItem[] }>(`/vehicles/${ref}/timeline`, { auth: true })),
    items(api<{ items: LedgerItem[] }>(`/vehicles/${ref}/evidence`, { auth: true })),
    items(api<{ items: CarPhoto[] }>(`/vehicles/${ref}/photos`, { auth: true })),
  ]);
  const x = { timeline, ledger, photos };

  const actions = (
    <>
      <form action={saved ? unsaveCar : saveCar}><input type="hidden" name="ref" value={ref} />
        <button className="btn btn-ghost" aria-pressed={saved}><Icon name={saved ? 'bookmark_added' : 'bookmark'} />{saved ? 'Saved' : 'Save this car'}</button></form>
      <Link href={`/compare?r=${ref}`} className="btn btn-ghost"><Icon name="compare_arrows" />Compare</Link>
      <Link href={`/inspections/book?${new URLSearchParams({ ref, ...(r.vehicle.currentPlate ? { plate: r.vehicle.currentPlate } : {}) })}`} className="btn btn-ghost"><Icon name="fact_check" />Book an inspection</Link>
      <PrintButton primary />
      {mine ? (
        <Link href={mine.status === 'verified' ? `/my-cars/${ref}` : '/my-cars'} className="btn btn-ghost"><Icon name="key" />{mine.status === 'verified' ? 'Your car' : 'Logbook being checked'}</Link>
      ) : (
        <form action={claimCar}><input type="hidden" name="ref" value={ref} />
          <button className="btn btn-ghost"><Icon name="key" />This is my car</button></form>
      )}
    </>
  );

  return (
    <>
      <ReportHero r={r} x={x} actions={actions} photoHref={(id) => `/v/${ref}/photo/${id}`} />
      <QuestionNav questions={r.questions} />
      <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-8 md:py-10 lg:px-12">
        {error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{error}</p>}
        <ReportSections r={r} x={x} />
        <NegotiateCard
          actions={(
            <>
              <form action={shareReport}><input type="hidden" name="ref" value={ref} />
                <button className="btn btn-focal"><Icon name="share" />Share this report</button></form>
              <Link href={`/compare?r=${ref}`} className="btn btn-ghost bg-white"><Icon name="compare_arrows" />Compare with another car</Link>
            </>
          )}
          links={(
            <>
              <Link href={`/v/${ref}/timeline`} className="link">Timeline</Link>
              <Link href={`/v/${ref}/evidence`} className="link">Evidence</Link>
            </>
          )}
        />
        {r.model && <ModelCommunity vehicleRef={ref} modelId={r.model.modelId} done={cdone} error={cerror} />}
        <p className="text-xs text-muted">SAZO describes what the available records show. It does not certify a vehicle. Rule set {r.ruleSetVersion} · Calculated {factValue('first_registration_date', r.asOf.slice(0, 10))}</p>
      </div>
    </>
  );
}

/** Signed out: the seven answers as statuses only — no figures (P-002) — in the design's summary card. */
function PublicSummary({ s, vref }: { s: Summary; vref: string }) {
  const by = new Map(s.questions.map((q) => [q.question, q]));
  const signIn = `/sign-in?next=/v/${vref}`;
  return (
    <div className="bg-gradient-to-b from-soft to-surface px-4 py-6 md:py-10">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-soft-3 bg-white shadow-xl shadow-primary/5">
        <header className="relative overflow-hidden bg-primary px-5 py-6 text-white md:px-8 md:py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {s.vehicle.currentPlate && <Plate value={s.vehicle.currentPlate} tone="light" />}
                {s.vehicle.status === 'provisional' && <span className="chip border-white/30 bg-white/10 text-white">Not yet confirmed by an official record</span>}
              </div>
              <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight md:text-4xl">{vehicleName(s.vehicle)}</h1>
              {/* D-148: the kind of car, the year and the engine size, open to everyone. */}
              {(s.vehicle.kind || s.vehicle.year || s.vehicle.engineCc) && (
                <p className="mt-1 text-sm font-semibold text-white/90" aria-label="Kind, year and engine size">
                  {[kindLabel(s.vehicle.kind), s.vehicle.year, s.vehicle.engineCc ? `${s.vehicle.engineCc.toLocaleString('en-GB')} cc` : undefined].filter(Boolean).join(' · ')}
                </p>
              )}
              <p className="mt-1 font-display text-lg font-bold text-lime">Before you buy, know the facts.</p>
              <p className="mt-1 max-w-xl text-sm text-white/80">The seven questions every buyer needs answered, from the records SAZO holds. Log in (free) for the figures and the records behind each answer.</p>
            </div>
            <div className="shrink-0 rounded-xl bg-lime px-4 py-3 text-ink">
              <p className="text-[11px] font-bold uppercase tracking-wider">Record Confidence</p>
              <p className="flex items-center gap-1.5 font-display text-xl font-extrabold"><Icon name="verified" size={22} />{CONFIDENCE_LABELS[s.recordConfidence.level] ?? s.recordConfidence.level}</p>
              <p className="text-xs">{s.recordConfidence.records} records · {s.recordConfidence.sources} sources</p>
            </div>
          </div>
        </header>
        <div className="space-y-3 bg-soft/50 p-4 md:p-6">
          {s.vehicle.banner && <Banner banner={s.vehicle.banner} />}
          <ConcernNotices notices={s.notices} />
          <DealerBalanceNote statuses={s.statuses} />
          {QUESTION_ORDER.filter((id) => by.has(id)).map((id, i) => {
            const q = by.get(id)!;
            const warm = q.status === 'attention' || q.status === 'serious';
            return (
              <article key={id} aria-labelledby={`sq-${id}`} className={`rounded-xl border p-4 md:p-5 ${q.status === 'serious' ? 'border-bad-line bg-bad-fill/30' : warm ? 'border-warn-line bg-warn-fill/40' : 'border-line bg-white'}`}>
                <div className="flex items-start gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${q.status === 'serious' ? 'bg-bad-fill text-bad-text' : warm ? 'bg-warn-fill text-warn-text' : 'bg-soft text-primary-container'}`}><Icon name={QUESTION_ICONS[id] ?? 'help'} size={22} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-label">Question {String(i + 1).padStart(2, '0')} · {QUESTION_TITLES[id]?.short}</p>
                        <h2 id={`sq-${id}`} className="font-display text-lg font-bold">{QUESTION_TITLES[id]?.ask}</h2>
                      </div>
                      <span className="shrink-0"><StatusChip status={q.status} label={statusLabel(id, q.status)} /></span>
                    </div>
                    <p className="mt-1 text-[15px] text-on-surface">{summaryLine(q.headlineKey)}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <footer className="flex flex-col gap-3 border-t border-line bg-white p-4 md:flex-row md:items-center md:justify-between md:px-6">
          <p className="text-sm text-muted">Free with an account: health score, price estimate, mileage history and every record.</p>
          <Link href={signIn} className="btn btn-focal shrink-0">Log in to see details<Icon name="arrow_forward" size={18} /></Link>
        </footer>
      </div>
      <p className="mx-auto mt-4 max-w-4xl text-xs text-muted">SAZO describes what the available records show. It does not certify a vehicle. Always inspect a car and check its documents before you pay.</p>
    </div>
  );
}
