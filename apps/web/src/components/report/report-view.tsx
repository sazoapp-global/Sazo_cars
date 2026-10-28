// The full car check report, laid out like the original design: a header with the car and its two scores,
// a question bar, then one section per buyer question with the records behind it. Only real records are
// shown; where SAZO has none, the section says so.
import { PANELS, PANEL_LABELS, QUESTION_ORDER, QUESTION_TITLES, formatDate, formatKm, formatUgx, headline, kindLabel, statusLabel, type Panel } from '@sazo/contracts';
import Image from 'next/image';
import Link from 'next/link';
import type { FullReport, LatestInspection, QuestionView } from '@/lib/types';
import {
  damageRecords, factMap, garageVisits, identityRows, kmPerYear, kmText, legalStatus, mainGarage, mileageReadings, origin,
  type IdentityRow, type ReportExtras,
} from '@/lib/report-data';
import { ConcernNotices, DealerBalanceNote } from '../concern-notices';
import { Confidence } from '../confidence';
import { HealthDial } from '../health-dial';
import { Icon, type IconName } from '../icon';
import { Plate } from '../plate';
import { StatusChip } from '../status';
import { Banner, vehicleName } from '../vehicle-card';
import { AboutCar } from './about-car';
import { MileageChart } from './mileage-chart';

type Tone = 'ok' | 'warn' | 'bad' | 'na';
const TONE: Record<Tone, string> = {
  ok: 'border-ok-line bg-ok-fill text-ok-text', warn: 'border-warn-line bg-warn-fill text-warn-text',
  bad: 'border-bad-line bg-bad-fill text-bad-text', na: 'border-na-line bg-na-fill text-na-text',
};
const TONE_ICON: Record<Tone, IconName> = { ok: 'check_circle', warn: 'info', bad: 'report', na: 'help' };
const Eyebrow = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] font-bold uppercase tracking-wider text-label">{children}</p>;

/* ---------------------------------------------------------------- header */

/** `embedded`: shown inside a workspace beside its side bar (28 Oct 2026): no buyers' breadcrumb, and the whole width. */
export function ReportHero({ r, x, actions, photoHref, embedded = false }: { r: FullReport; x: ReportExtras; actions?: React.ReactNode; photoHref?: (id: string) => string; embedded?: boolean }) {
  const f = factMap(r);
  const spec = x.ledger?.find((l) => l.type === 'spec_declared' && !l.excluded)?.attributes ?? {};
  const legal = legalStatus(r, x);
  const legalTone: Tone = legal.police.tone === 'bad' || legal.loan.tone === 'bad' ? 'bad' : 'ok';
  const tiles: { label: string; value: string; sub?: string; tone?: Tone }[] = [
    { label: 'Mileage', value: f.text('current_mileage_km') ?? 'Not recorded', sub: 'Latest reading on record' },
    { label: 'Engine', value: [spec.engineCc ? `${(Number(spec.engineCc) / 1000).toFixed(1)}L` : undefined, f.text('fuel')].filter(Boolean).join(' ') || 'Not recorded', sub: f.text('transmission') },
    { label: 'Owners in Uganda', value: f.text('owner_count') ?? 'Not recorded', sub: f.text('usage_type') ? `${f.text('usage_type')} use` : undefined },
    { label: 'Police & loans', value: legalTone === 'bad' ? 'Needs checking' : 'Nothing open', sub: legalTone === 'bad' ? 'See question 6' : 'On the records we have', tone: legalTone },
  ];
  return (
    <section className={embedded ? '' : 'border-b border-line bg-gradient-to-b from-soft to-surface'} aria-label="This car">
      <div className={embedded ? '' : 'mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8 lg:px-12'}>
        {!embedded && <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-primary-container">Check a car</Link></li>
            <li aria-hidden><Icon name="chevron_right" size={16} /></li>
            <li aria-current="page" className="font-semibold text-ink">{vehicleName(r.vehicle)}{r.vehicle.currentPlate ? ` (${r.vehicle.currentPlate})` : ''}</li>
          </ol>
        </nav>}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="card p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {r.vehicle.currentPlate && <Plate value={r.vehicle.currentPlate} />}
              {r.vehicle.status === 'provisional'
                ? <span className="chip border-na-line bg-na-fill text-na-text">Not yet confirmed by an official record</span>
                : <span className="chip border-soft-3 bg-soft text-primary-container"><Icon name="verified_user" size={14} />Official record found</span>}
              {f.text('first_registration_date') && <span className="text-sm text-muted">First registered {f.text('first_registration_date')}</span>}
            </div>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-primary-container md:text-4xl">
              {vehicleName(r.vehicle)}
              {r.vehicle.kind && <span className="chip ml-2 border-soft-3 bg-soft align-middle text-sm text-primary-container">{kindLabel(r.vehicle.kind)}</span>}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {[f.text('current_colour'), f.text('transmission')].filter(Boolean).join(' · ')}{f.text('current_colour') || f.text('transmission') ? ' · ' : ''}
              SAZO reference <span className="sazo-id">{r.vehicle.vehicleRef}</span>
            </p>
            {r.vehicle.banner && <div className="mt-3"><Banner banner={r.vehicle.banner} /></div>}
            <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-xl border border-line bg-soft p-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-label">{t.label}</dt>
                  <dd className={`mt-1 font-display text-lg font-extrabold leading-tight ${t.tone === 'bad' ? 'text-bad-text' : t.tone === 'ok' ? 'text-ok-text' : 'text-ink'}`}>{t.value}</dd>
                  {t.sub && <dd className="text-xs text-muted">{t.sub}</dd>}
                </div>
              ))}
            </dl>
            <div className="mt-5 grid gap-5 rounded-xl border border-soft-3 bg-soft/60 p-4 md:grid-cols-2" aria-label="Scores" role="group">
              <HealthDial health={r.health} />
              <Confidence rc={r.recordConfidence} />
            </div>
            {actions && <div className="mt-5 flex flex-wrap gap-2 print:hidden">{actions}</div>}
          </div>
          <div className="space-y-4">
            <PhotoPanel photos={x.photos} href={photoHref} />
            <InspectionMini x={r.latestInspection ?? null} />
          </div>
        </div>
        {r.about && <AboutCar details={r.about.details} />}
      </div>
    </section>
  );
}

function PhotoPanel({ photos, href }: { photos?: ReportExtras['photos']; href?: (id: string) => string }) {
  if (!photos?.length || !href) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 bg-soft p-6 text-center sm:aspect-[16/10]">
        <span className="grid size-14 place-items-center rounded-full bg-white text-primary-container shadow-sm"><Icon name="photo_camera" size={28} /></span>
        <p className="font-display font-bold">No photos of this car yet</p>
        <p className="max-w-xs text-sm text-muted">Photos appear here when an approved inspector inspects the car.</p>
      </div>
    );
  }
  const [main, ...rest] = photos;
  return (
    <figure className="card overflow-hidden p-2">
      <img src={href(main!.photoId)} alt={`Photo of the car taken at inspection on ${formatDate(main!.takenAt)}`} className="aspect-[16/10] w-full rounded-lg bg-soft object-cover" />
      {rest.length > 0 && (
        <ul className="mt-2 grid grid-cols-4 gap-2">
          {rest.slice(0, 4).map((p) => (
            <li key={p.photoId}>
              <a href={href(p.photoId)} target="_blank" rel="noreferrer" className="block">
                <img src={href(p.photoId)} alt={`Inspection photo, ${formatDate(p.takenAt)}`} className="aspect-square w-full rounded-md bg-soft object-cover" loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <figcaption className="flex items-center gap-1.5 px-1 pt-2 text-xs text-muted"><Icon name="photo_library" size={14} />{photos.length} {photos.length === 1 ? 'photo' : 'photos'} from inspections by {main!.takenBy}</figcaption>
    </figure>
  );
}

function InspectionMini({ x }: { x: LatestInspection | null }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-lime/40 text-ink"><Icon name="fact_check" size={22} /></span>
      <div className="min-w-0 flex-1">
        {x ? (
          <>
            <p className="font-display font-bold">Latest inspection: {x.passed ? 'passed' : 'did not pass'}</p>
            <p className="text-sm text-muted">{x.sourceLabel} · {formatDate(x.date)}</p>
          </>
        ) : (
          <>
            <p className="font-display font-bold">No inspection on record</p>
            <p className="text-sm text-muted">Have a trusted mechanic or an approved inspector look at the car before you pay.</p>
          </>
        )}
      </div>
      {x && <a href="#q-damage" className="link shrink-0 text-sm">Details</a>}
    </div>
  );
}

/* ---------------------------------------------------------------- question bar */

export function QuestionNav({ questions, embedded = false }: { questions: QuestionView[]; embedded?: boolean }) {
  const by = new Map(questions.map((q) => [q.question, q]));
  return (
    <nav aria-label="Questions" className={`sticky z-20 border-b border-line bg-surface/95 backdrop-blur-md print:hidden ${embedded ? '-mx-4 top-16 md:-mx-8 md:top-20 lg:top-12' : 'top-16 md:top-20'}`}>
      <ol className={`flex items-center gap-2 overflow-x-auto py-3 ${embedded ? 'px-4 md:px-8' : 'mx-auto max-w-[1280px] px-4 md:px-8 lg:px-12'}`}>
        <li className="hidden shrink-0 text-[11px] font-bold uppercase tracking-wider text-label sm:block">Questions:</li>
        {QUESTION_ORDER.filter((id) => by.has(id)).map((id, i) => {
          const q = by.get(id)!;
          const dot = q.status === 'verified' ? 'bg-ok-text' : q.status === 'attention' ? 'bg-warn-text' : q.status === 'serious' ? 'bg-bad-text' : 'bg-na-text';
          return (
            <li key={id} className="shrink-0">
              <a href={`#q-${id}`} className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:border-primary-container hover:text-primary-container">
                <span className={`size-2 rounded-full ${dot}`} aria-hidden />{i + 1}. {QUESTION_TITLES[id]?.ask}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------------------------------------------------------------- one question */

function Section({ q, children, aside }: { q: QuestionView; children?: React.ReactNode; aside?: React.ReactNode }) {
  const n = QUESTION_ORDER.indexOf(q.question as (typeof QUESTION_ORDER)[number]) + 1;
  const t = QUESTION_TITLES[q.question];
  return (
    <section id={`q-${q.question}`} aria-labelledby={`q-${q.question}-h`} className="card scroll-mt-36 p-5 md:p-7">
      <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-container font-display text-lg font-extrabold text-white" aria-hidden>{n}</span>
          <div>
            <Eyebrow>Question {String(n).padStart(2, '0')} · {t?.short}</Eyebrow>
            <h2 id={`q-${q.question}-h`} className="font-display text-xl font-extrabold text-primary-container md:text-2xl">“{t?.ask}”</h2>
          </div>
        </div>
        <span className="shrink-0"><StatusChip status={q.status} label={statusLabel(q.question, q.status)} /></span>
      </header>
      <p className="mt-4 text-[15px] md:text-base">{headline(q.headlineKey, q.params)}</p>
      {q.notes && q.notes.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-soft-3 pl-3 text-sm text-muted">{q.notes.map((note) => <li key={note.key}>{headline(note.key, note.params)}</li>)}</ul>
      )}
      {(children || aside) && (
        <div className={`mt-5 grid gap-6 ${aside ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
          <div className="min-w-0">{children}</div>
          {aside && <aside className="min-w-0">{aside}</aside>}
        </div>
      )}
    </section>
  );
}

const Tip = ({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) => (
  <div className="rounded-xl border border-soft-3 bg-soft p-4">
    <p className="flex items-center gap-2 font-display font-bold text-primary-container"><Icon name={icon} size={20} />{title}</p>
    <div className="mt-2 space-y-2 text-sm">{children}</div>
  </div>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg border border-dashed border-line-strong bg-soft/50 p-4 text-sm text-muted">{children}</p>;

/* ---------------------------------------------------------------- the seven sections */

export function ReportSections({ r, x }: { r: FullReport; x: ReportExtras }) {
  const by = new Map(r.questions.map((q) => [q.question, q]));
  const has = (id: string) => by.has(id);
  const full = !!x.ledger; // a shared copy has the report only, not the record ledger
  return (
    <div className="space-y-6">
      <ConcernNotices notices={r.notices} />
      <DealerBalanceNote statuses={r.statuses} />
      {r.openConflicts.length > 0 && (
        <div role="alert" className="rounded-xl border border-bad-line bg-bad-fill p-4 text-bad-text">
          <p className="flex items-center gap-2 font-semibold"><Icon name="warning" size={18} />Some records disagree</p>
          <ul className="mt-1 list-disc pl-6 text-sm">{r.openConflicts.map((c) => <li key={c.topic}>{headline(c.headlineKey)}</li>)}</ul>
        </div>
      )}
      {has('identity') && <Section q={by.get('identity')!} aside={<IdentityTips />}>{full && <IdentityTable rows={identityRows(r, x)} />}</Section>}
      {has('care') && <CareSection q={by.get('care')!} x={x} full={full} />}
      {has('damage') && <DamageSection q={by.get('damage')!} r={r} x={x} full={full} />}
      {has('mileage') && <MileageSection q={by.get('mileage')!} r={r} x={x} full={full} />}
      {has('provenance') && <ProvenanceSection q={by.get('provenance')!} r={r} x={x} />}
      {has('legal_financial') && <LegalSection q={by.get('legal_financial')!} r={r} x={x} />}
      {has('valuation') && <ValuationSection q={by.get('valuation')!} r={r} />}
    </div>
  );
}

const MATCH: Record<IdentityRow['result'], { text: string; tone: Tone }> = {
  same: { text: 'Matches', tone: 'ok' }, differs: { text: 'Differs', tone: 'warn' }, replaced: { text: 'Replacement recorded', tone: 'na' }, one: { text: 'One record', tone: 'na' },
};

function IdentityTable({ rows }: { rows: IdentityRow[] }) {
  if (!rows.length) return <Empty>No official specification record yet.</Empty>;
  return (
    <>
    <ul className="divide-y divide-line rounded-xl border border-line sm:hidden">
      {rows.map((row) => (
        <li key={row.label} className="p-3">
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">{row.label}</span><span className={`chip ${TONE[MATCH[row.result].tone]}`}>{MATCH[row.result].text}</span></div>
          <dl className="mt-1 grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-[11px] font-bold uppercase tracking-wider text-label">Official record</dt><dd className="text-muted">{row.record ?? 'Not recorded'}</dd></div>
            <div><dt className="text-[11px] font-bold uppercase tracking-wider text-label">Latest record</dt><dd className="font-semibold">{row.latest ?? 'Not recorded'}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
    <div tabIndex={0} role="region" aria-label="Records compared" className="hidden overflow-x-auto rounded-xl border border-line sm:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">What the official records say, against the latest record of the car</caption>
        <thead className="bg-soft text-[11px] font-bold uppercase tracking-wider text-label">
          <tr><th scope="col" className="px-4 py-3">Detail</th><th scope="col" className="px-4 py-3">Official record</th><th scope="col" className="px-4 py-3">Latest record</th><th scope="col" className="px-4 py-3">Result</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="px-4 py-3 font-semibold">{row.label}</th>
              <td className="px-4 py-3 text-muted">{row.record ?? 'Not recorded'}</td>
              <td className="px-4 py-3 font-semibold">{row.latest ?? 'Not recorded'}</td>
              <td className="px-4 py-3"><span className={`chip ${TONE[MATCH[row.result].tone]}`}>{MATCH[row.result].text}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function IdentityTips() {
  return (
    <Tip title="Check it on the car yourself" icon="pin_drop">
      <p>Before you pay, match these on the car with the logbook and this report:</p>
      <ul className="space-y-2">
        <li className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-primary-container" /><span><strong>Chassis number:</strong> stamped on the body; ask the seller to show you where.</span></li>
        <li className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-primary-container" /><span><strong>Engine number:</strong> on the engine block.</span></li>
        <li className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-primary-container" /><span><strong>Number plates:</strong> front and back should match the logbook.</span></li>
      </ul>
    </Tip>
  );
}

function CareSection({ q, x, full }: { q: QuestionView; x: ReportExtras; full: boolean }) {
  const visits = garageVisits(x);
  const main = mainGarage(visits);
  return (
    <Section q={q} aside={main && (
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="relative aspect-[4/3] bg-soft">
          <Image src="/images/mechanic.webp" alt="" fill sizes="(min-width: 1024px) 400px, 100vw" className="object-cover" />
          <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Illustration</span>
        </div>
        <div className="p-4">
          <Eyebrow>Main garage on record</Eyebrow>
          <p className="font-display text-lg font-bold text-primary-container">{main.name}</p>
          <p className="text-sm text-muted">{main.visits} of {visits.length} recorded {visits.length === 1 ? 'visit' : 'visits'}</p>
          {main.everyKm && <p className="mt-2 flex justify-between rounded-lg bg-soft px-3 py-2 text-sm"><span>Usual gap between visits</span><span className="font-semibold">About {formatKm(main.everyKm)}</span></p>}
        </div>
      </div>
    )}>
      {full && (visits.length ? (
        <>
          <h3 className="mb-3 font-display font-bold">Garage visits, newest first</h3>
          <ol className="space-y-3">
            {visits.map((v) => (
              <li key={v.eventId} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <time dateTime={v.at ?? undefined} className="rounded bg-ink px-2 py-0.5 text-xs font-bold text-white">{formatDate(v.at, v.precision)}</time>
                  {v.km !== null && <span className="font-display text-lg font-extrabold tabular-nums">{formatKm(v.km)}</span>}
                  {v.confirmed && <span className="chip border-ok-line bg-ok-fill text-ok-text"><Icon name="check_circle" size={14} />Confirmed by the customer</span>}
                </div>
                <p className="mt-1 font-semibold">{v.lines.join(' · ') || 'Garage visit'}</p>
                {v.description && <p className="text-sm text-muted">{v.description}</p>}
                <p className="mt-1 text-xs text-muted">{v.garage}{v.photos ? ` · ${v.photos} ${v.photos === 1 ? 'photo' : 'photos'} kept by SAZO` : ''}</p>
              </li>
            ))}
          </ol>
        </>
      ) : <Empty>No garage visits on record yet. Ask the seller for service receipts.</Empty>)}
    </Section>
  );
}

function DamageSection({ q, r, x, full }: { q: QuestionView; r: FullReport; x: ReportExtras; full: boolean }) {
  const records = damageRecords(x);
  const insp = r.latestInspection;
  return (
    <Section q={q} aside={insp && <InspectionPanel x={insp} />}>
      {full && (records.length ? (
        <>
          <h3 className="mb-3 font-display font-bold">Accident, repair and paint records</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {records.map((d) => (
              <li key={d.id} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="font-semibold">{d.label}</span>
                <span className="text-sm text-muted">{formatDate(d.at, d.precision)} · {d.source}</span>
              </li>
            ))}
          </ul>
        </>
      ) : <Empty>No accident, insurance, repair or paint records for this car.</Empty>)}
      {insp && insp.panelsMeasured > 0 && <PanelGrid repainted={insp.repaintedPanels} />}
    </Section>
  );
}

function PanelGrid({ repainted }: { repainted: string[] }) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 font-display font-bold">Paint thickness by panel</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {PANELS.map((p) => {
          const hit = repainted.includes(p);
          return (
            <li key={p} className={`rounded-lg border p-2.5 text-center text-sm ${hit ? 'border-warn-line bg-warn-fill' : 'border-line bg-white'}`}>
              <span className="block font-semibold">{PANEL_LABELS[p as Panel]}</span>
              <span className={`text-xs font-semibold ${hit ? 'text-warn-text' : 'text-ok-text'}`}>{hit ? 'Thicker than factory' : 'Factory range'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The latest inspection SAZO counts (P-004): what a trained person found on the car that day. */
function InspectionPanel({ x }: { x: LatestInspection }) {
  const rows: [string, string, Tone][] = [
    ['Structure', x.structuralFindings === null ? 'Not recorded' : x.structuralFindings ? 'Structural damage found' : 'No structural damage found', x.structuralFindings ? 'bad' : x.structuralFindings === null ? 'na' : 'ok'],
    ['Paint', x.panelsMeasured === 0 ? 'Not measured' : x.repaintedPanels.length ? `Thicker than factory paint on ${x.repaintedPanels.map((p) => PANEL_LABELS[p as Panel] ?? p).join(', ')}` : `${x.panelsMeasured} panels measured, all within factory range`, x.repaintedPanels.length ? 'warn' : x.panelsMeasured ? 'ok' : 'na'],
    ['Tyres', x.tyresPercent === null ? 'Not recorded' : `${x.tyresPercent}% tread left on the most worn tyre`, x.tyresPercent === null ? 'na' : x.tyresPercent < 25 ? 'warn' : 'ok'],
    ['Battery', x.batteryOk === null ? 'Not recorded' : x.batteryOk ? 'OK' : 'Needs attention', x.batteryOk === null ? 'na' : x.batteryOk ? 'ok' : 'warn'],
  ];
  const cls: Record<Tone, string> = { ok: 'text-ok-text', warn: 'text-warn-text', bad: 'text-bad-text', na: 'text-muted' };
  return (
    <section className="rounded-xl border border-soft-3 bg-soft p-4" aria-labelledby="inspection">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="inspection" className="flex items-center gap-2 font-display font-bold text-primary-container"><Icon name="fact_check" size={20} />Latest inspection</h3>
        <span className={`chip ${x.passed ? TONE.ok : TONE.bad}`}><Icon name={x.passed ? 'check_circle' : 'report'} size={14} />{x.passed ? 'Passed' : 'Did not pass'}</span>
      </div>
      <p className="text-sm text-muted">{x.sourceLabel} · {formatDate(x.date)}{x.photos ? ` · ${x.photos} photos kept by SAZO` : ''}</p>
      <dl className="mt-3 divide-y divide-line rounded-lg bg-white px-3">
        {rows.filter(([, , tone]) => tone !== 'na').map(([k, v, tone]) => (
          <div key={k} className="py-2"><dt className="text-xs font-bold uppercase tracking-wider text-label">{k}</dt><dd className={`font-semibold ${cls[tone]}`}>{v}</dd></div>
        ))}
        <div className="py-2"><dt className="text-xs font-bold uppercase tracking-wider text-label">Defects noted</dt>
          <dd className="mt-1">{x.defects.length === 0 ? <span className="font-semibold">None</span> : (
            <ul className="space-y-1">{x.defects.map((d, i) => (
              <li key={`${d.item}-${i}`} className="flex items-start gap-2"><Icon name={d.severity === 'major' ? 'report' : 'info'} size={16} className={`mt-0.5 shrink-0 ${d.severity === 'major' ? 'text-bad-text' : 'text-warn-text'}`} />
                <span>{d.item}{d.severity === 'major' && <span className="font-semibold text-bad-text"> (major)</span>}</span></li>
            ))}</ul>
          )}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted">An inspection shows the car on that day. Things can change. Check it again before you pay.</p>
    </section>
  );
}

function MileageSection({ q, r, x, full }: { q: QuestionView; r: FullReport; x: ReportExtras; full: boolean }) {
  const readings = mileageReadings(x);
  const perYear = kmPerYear(readings);
  const latest = factMap(r).get('current_mileage_km') as number | undefined;
  const drops = readings.filter((rd, i) => i > 0 && rd.km < readings[i - 1]!.km).length;
  return (
    <Section q={q} aside={full && readings.length > 0 && (
      <div className="rounded-xl border border-line p-4">
        <h3 className="font-display font-bold">Every reading</h3>
        <ol className="mt-2 divide-y divide-line text-sm">
          {[...readings].reverse().map((rd, i) => (
            <li key={`${rd.at}-${i}`} className="flex justify-between gap-3 py-2">
              <span><span className="font-semibold">{formatDate(rd.at)}</span><span className="block text-xs text-muted">{rd.source}</span></span>
              <span className="font-semibold tabular-nums">{formatKm(rd.km)}</span>
            </li>
          ))}
        </ol>
      </div>
    )}>
      {full && (readings.length >= 2 ? (
        <div className="rounded-xl border border-line p-4 md:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-2xl font-extrabold">{kmText(latest ?? readings.at(-1)!.km)}</p>
              {perYear !== null && <p className="text-sm text-muted">About {formatKm(perYear)} a year across {readings.length} readings</p>}
            </div>
            <span className={`chip ${drops ? TONE.bad : TONE.ok}`}><Icon name={drops ? 'trending_down' : 'trending_up'} size={14} />{drops ? `${drops} ${drops === 1 ? 'reading' : 'readings'} lower than before` : 'Rises with every reading'}</span>
          </div>
          <div className="mt-4"><MileageChart readings={readings} /></div>
        </div>
      ) : <Empty>Fewer than two dated mileage readings, not enough to draw a history.</Empty>)}
    </Section>
  );
}

function InfoCard({ icon, eyebrow, title, children }: { icon: IconName; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <span className="grid size-10 place-items-center rounded-lg bg-soft text-primary-container"><Icon name={icon} size={22} /></span>
      <div className="mt-3"><Eyebrow>{eyebrow}</Eyebrow></div>
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

function ProvenanceSection({ q, r, x }: { q: QuestionView; r: FullReport; x: ReportExtras }) {
  const o = origin(r, x);
  return (
    <Section q={q}>
      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard icon="flight_land" eyebrow="Imported from" title={o.country ?? 'Not recorded'}>
          {o.port || o.importedAt ? <p>{[o.port ? `Through ${o.port}` : undefined, o.importedAt ? formatDate(o.importedAt) : undefined].filter(Boolean).join(' · ')}</p> : null}
          {o.auctionGrade && <p>Auction grade {o.auctionGrade} recorded before export.</p>}
        </InfoCard>
        <InfoCard icon="badge" eyebrow="Owners in Uganda" title={o.owners !== undefined ? `${o.owners} ${o.owners === 1 ? 'owner' : 'owners'}` : 'Not recorded'}>
          {o.firstRegistered && <p>First registered {o.firstRegistered}.</p>}
          <p>Owner names are never shown.</p>
        </InfoCard>
        <InfoCard icon="local_shipping" eyebrow="Type of use" title={o.usage ?? 'Not recorded'}>
          <p>{o.usage ? 'As declared in the records.' : 'No record says how the car was used (private, rental, taxi).'}</p>
        </InfoCard>
      </div>
    </Section>
  );
}

function LegalSection({ q, r, x }: { q: QuestionView; r: FullReport; x: ReportExtras }) {
  const s = legalStatus(r, x);
  const cards: { icon: IconName; title: string; tone: Tone; text: string }[] = [
    { icon: 'local_police', title: 'Police records', ...s.police },
    { icon: 'account_balance', title: 'Loans on the car', ...s.loan },
    ...(x.ledger ? [{ icon: 'receipt_long' as const, title: 'Customs', ...s.customs }] : []),
  ];
  return (
    <Section q={q}>
      <div className={`grid gap-4 ${cards.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {cards.map((c) => (
          <div key={c.title} className={`rounded-xl border p-4 ${c.tone === 'bad' ? 'border-bad-line bg-bad-fill/40' : 'border-line'}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="grid size-10 place-items-center rounded-lg bg-soft text-primary-container"><Icon name={c.icon} size={22} /></span>
              <span className={`chip ${TONE[c.tone]}`}><Icon name={TONE_ICON[c.tone]} size={14} />{c.tone === 'ok' ? 'Nothing open' : c.tone === 'bad' ? 'Check this' : c.tone === 'warn' ? 'Note' : 'No record'}</span>
            </div>
            <p className="mt-3 font-display text-lg font-bold">{c.title}</p>
            <p className="text-sm">{c.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">SAZO shows only whether a record exists, never the details. Ask the seller for proof a loan is paid off, and check with the police if a report is open.</p>
    </Section>
  );
}

function ValuationSection({ q, r }: { q: QuestionView; r: FullReport }) {
  const range = r.valuation.range;
  return (
    <Section q={q} aside={
      <Tip title="What moves the price" icon="sell">
        <ul className="space-y-1.5">
          <li>Condition at an inspection, and any repairs it needs.</li>
          <li>Service receipts and how regularly it was looked after.</li>
          <li>Complete papers: logbook, customs and loan clearance.</li>
        </ul>
      </Tip>
    }>
      {range ? (
        <div className="rounded-xl border border-line p-5">
          <Eyebrow>Estimated price range</Eyebrow>
          <p className="font-display text-3xl font-extrabold text-primary-container md:text-4xl">{formatUgx(range.lowUgx)} to {formatUgx(range.highUgx)}</p>
          <p className="mt-1 text-sm text-muted">From {range.comparables} similar cars in SAZO’s price records. This is an estimate. The car’s condition and documents change the price.</p>
          <dl className="mt-4 divide-y divide-line text-sm">
            <div className="flex justify-between py-2"><dt>Lower end</dt><dd className="font-semibold">{formatUgx(range.lowUgx)}</dd></div>
            <div className="flex justify-between rounded-lg bg-lime/40 px-2 py-2 font-bold"><dt>Typical</dt><dd>{formatUgx(range.midUgx)}</dd></div>
            <div className="flex justify-between py-2"><dt>Upper end</dt><dd className="font-semibold">{formatUgx(range.highUgx)}</dd></div>
          </dl>
        </div>
      ) : <Empty>Not enough similar cars to estimate a price yet.</Empty>}
    </Section>
  );
}

/* ---------------------------------------------------------------- closing card */

export function NegotiateCard({ actions, links }: { actions?: React.ReactNode; links?: React.ReactNode }) {
  return (
    <section aria-labelledby="next" className="overflow-hidden rounded-[14px] border border-soft-3 bg-soft">
      <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="relative min-h-48 bg-soft-3">
          <Image src="/images/handshake.webp" alt="" fill sizes="(min-width: 768px) 40vw, 100vw" className="object-cover" />
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Illustration</span>
        </div>
        <div className="p-5 md:p-7">
          <h2 id="next" className="flex items-center gap-2 font-display text-xl font-extrabold text-primary-container md:text-2xl"><Icon name="handshake" size={26} />Before you pay</h2>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" />Compare the chassis number on the car with the logbook and with this report.</li>
            <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" />Ask the seller for service receipts and proof any loan on the car is paid off.</li>
            <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" />Have a mechanic you trust inspect it. Records can&apos;t show everything.</li>
          </ul>
          {actions && <div className="mt-5 flex flex-wrap gap-2 print:hidden">{actions}</div>}
          {links && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm print:hidden">{links}</div>}
        </div>
      </div>
    </section>
  );
}

