import { FACT_LABELS, PANEL_LABELS, factValue, formatDate, formatUgx, headline, type Panel } from '@sazo/contracts';
import type { FullReport, LatestInspection } from '@/lib/types';
import { ConcernNotices } from './concern-notices';
import { Confidence } from './confidence';
import { HealthDial } from './health-dial';
import { Icon } from './icon';
import { QuestionCard } from './question-card';
import { vehicleName } from './vehicle-card';

const FACT_ORDER = ['current_mileage_km', 'first_registration_date', 'import_origin', 'owner_count', 'usage_type', 'current_colour', 'fuel', 'transmission', 'finance_status', 'title_status'];

/** The full report body (scores, disagreements, key facts, the seven questions, price). Used live and in shared copies. */
export function FullReportView({ r }: { r: FullReport }) {
  const facts = new Map(r.facts.map((f) => [f.key, f]));
  const valuation = r.questions.find((q) => q.question === 'valuation');
  return (
    <>
        <ConcernNotices notices={r.notices} />
        <section className="card grid gap-6 p-4 md:grid-cols-2 md:p-5" aria-label="Scores">
          <HealthDial health={r.health} />
          <Confidence rc={r.recordConfidence} />
        </section>

        {r.openConflicts.length > 0 && (
          <div role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-4 text-bad-text">
            <p className="flex items-center gap-2 font-semibold"><Icon name="warning" size={18} />Some records disagree</p>
            <ul className="mt-1 list-disc pl-6 text-sm">{r.openConflicts.map((c) => <li key={c.topic}>{headline(c.headlineKey)}</li>)}</ul>
          </div>
        )}

        <section className="card p-4 md:p-5" aria-labelledby="facts">
          <h2 id="facts" className="font-display text-lg font-semibold">Key facts about {vehicleName(r.vehicle)}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            {FACT_ORDER.filter((k) => facts.has(k)).map((k) => {
              const f = facts.get(k)!;
              return (
                <div key={k}>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-label">{FACT_LABELS[k]}</dt>
                  <dd className="font-semibold">{factValue(k, f.value)}{f.estimated && <span className="ml-1 text-xs font-normal text-muted">(estimate)</span>}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        {r.questions.filter((q) => q.question !== 'valuation').map((q) => <QuestionCard key={q.question} q={q} detailed />)}

        {r.latestInspection && <InspectionCard x={r.latestInspection} />}

        {valuation && (
          <QuestionCard q={valuation} detailed>
            {r.valuation.range ? (
              <div className="mt-3 rounded-lg bg-soft p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-label">Estimated price range</p>
                <p className="font-display text-2xl font-extrabold">{formatUgx(r.valuation.range.lowUgx)} – {formatUgx(r.valuation.range.highUgx)}</p>
                <p className="text-sm text-muted">Typical: {formatUgx(r.valuation.range.midUgx)}. This is an estimate — the car’s condition and documents change the price.</p>
              </div>
            ) : null}
          </QuestionCard>
        )}

    </>
  );
}

/** The latest inspection SAZO counts (P-004): what a trained person found on the car that day. */
function InspectionCard({ x }: { x: LatestInspection }) {
  const rows: [string, string, 'ok' | 'warn' | 'bad' | 'na'][] = [
    ['Structure', x.structuralFindings === null ? 'Not recorded' : x.structuralFindings ? 'Structural damage found' : 'No structural damage found', x.structuralFindings ? 'bad' : x.structuralFindings === null ? 'na' : 'ok'],
    ['Paint', x.panelsMeasured === 0 ? 'Not measured' : x.repaintedPanels.length ? `Thicker than factory paint on ${x.repaintedPanels.map((p) => PANEL_LABELS[p as Panel] ?? p).join(', ')}` : `${x.panelsMeasured} panels measured, all within factory range`, x.repaintedPanels.length ? 'warn' : x.panelsMeasured ? 'ok' : 'na'],
    ['Tyres', x.tyresPercent === null ? 'Not recorded' : `${x.tyresPercent}% tread left on the most worn tyre`, x.tyresPercent === null ? 'na' : x.tyresPercent < 25 ? 'warn' : 'ok'],
    ['Battery', x.batteryOk === null ? 'Not recorded' : x.batteryOk ? 'OK' : 'Needs attention', x.batteryOk === null ? 'na' : x.batteryOk ? 'ok' : 'warn'],
  ];
  const cls = { ok: 'text-ok-text', warn: 'text-warn-text', bad: 'text-bad-text', na: 'text-muted' } as const;
  return (
    <section className="card p-4 md:p-5" aria-labelledby="inspection">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="inspection" className="font-display text-lg font-semibold">Latest inspection</h2>
        <span className={`chip ${x.passed ? 'border-ok-line bg-ok-fill text-ok-text' : 'border-bad-line bg-bad-fill text-bad-text'}`}>
          <Icon name={x.passed ? 'check_circle' : 'report'} size={14} />{x.passed ? 'Passed' : 'Did not pass'}</span>
      </div>
      <p className="text-sm text-muted">{x.sourceLabel} · {formatDate(x.date)}{x.photos ? ` · ${x.photos} photos kept by SAZO` : ''}</p>
      <dl className="mt-3 divide-y divide-line">
        {rows.filter(([, , tone]) => tone !== 'na').map(([k, v, tone]) => (
          <div key={k} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-muted">{k}</dt><dd className={`font-semibold sm:text-right ${cls[tone]}`}>{v}</dd></div>
        ))}
        <div className="py-2"><dt className="text-muted">Defects noted</dt>
          <dd className="mt-1">{x.defects.length === 0 ? <span className="font-semibold">None</span> : (
            <ul className="space-y-1">{x.defects.map((d, i) => (
              <li key={`${d.item}-${i}`} className="flex items-start gap-2"><Icon name={d.severity === 'major' ? 'report' : 'info'} size={16} className={`mt-0.5 shrink-0 ${d.severity === 'major' ? 'text-bad-text' : 'text-warn-text'}`} />
                <span>{d.item}{d.severity === 'major' && <span className="font-semibold text-bad-text"> (major)</span>}</span></li>
            ))}</ul>
          )}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-muted">An inspection shows the car on that day. Things can change — check it again before you pay.</p>
    </section>
  );
}

export function NextSteps() {
  return (
    <section className="card p-4 md:p-5" aria-labelledby="next">
      <h2 id="next" className="font-display text-lg font-semibold">Before you pay</h2>
      <ul className="mt-2 space-y-2 text-[15px]">
        <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" />Compare the chassis number on the car with the logbook and with this report.</li>
        <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" />Ask the seller for service receipts and proof any loan on the car is paid off.</li>
        <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" />Have a mechanic you trust inspect it. Records can&apos;t show everything.</li>
      </ul>
    </section>
  );
}
