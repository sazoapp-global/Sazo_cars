// The side-by-side comparison tables (28 Oct 2026): the cars, the seven questions and the car details. Used on the
// buyers' Compare page and inside the dealer console's report (its Compare view), where "Open report" stays inside.
import { CAR_DETAIL_KEYS, CONFIDENCE_LABELS, DETAIL_SOURCE_LABELS, HEALTH_FACTORS, QUESTION_ORDER, QUESTION_TITLES, factValue, formatUgx, headline, statusLabel } from '@sazo/contracts';
import Link from 'next/link';
import { Icon } from '../icon';
import { Plate } from '../plate';
import { DETAIL_LABELS, detailValue } from '../report/about-car';
import { StatusChip } from '../status';
import { vehicleName } from '../vehicle-card';
import { QUESTION_ICONS } from '@/lib/questions';
import type { CarPhoto } from '@/lib/report-data';
import type { Comparison, FullReport } from '@/lib/types';

/** The seven questions, side by side; rows where the cars differ are marked. */
export function CompareMatrix({ c }: { c: Comparison }) {
  const differs = new Set(c.differingQuestions);
  return (
    <section aria-labelledby="matrix">
      <h2 id="matrix" className="font-display text-2xl font-extrabold text-primary-container md:text-3xl">The 7 buyer questions</h2>
      <p className="mt-1 text-muted">What the records say for each car, question by question.</p>
      <div tabIndex={0} role="region" aria-label="The 7 buyer questions, side by side (scrolls sideways on small screens)" className="mt-5 overflow-x-auto rounded-[14px] border border-line bg-white focus-visible:outline-2 focus-visible:outline-primary-container">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Seven buyer questions compared across {c.vehicles.length} cars</caption>
          <thead className="bg-soft">
            <tr>
              <th scope="col" className="w-60 p-4 text-[11px] font-bold uppercase tracking-wider text-label">Question</th>
              {c.vehicles.map((v) => (
                <th key={v.vehicle.vehicleRef} scope="col" className="p-4 align-bottom">
                  <span className="block font-display text-base font-bold text-ink">{vehicleName(v.vehicle)}</span>
                  {v.vehicle.currentPlate && <span className="mt-1 inline-block"><Plate value={v.vehicle.currentPlate} size="sm" /></span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <Row label="Vehicle Health" sub="Condition the records suggest">
              {c.vehicles.map((v) => (
                <td key={v.vehicle.vehicleRef} className="p-4 align-top">
                  {v.health.insufficient ? <span className="font-semibold text-na-text">Insufficient history</span> : (
                    <><span className="font-display text-2xl font-extrabold">{v.health.score}</span><span className="text-muted"> / 100</span>
                      {v.health.deductions.length > 0 && <span className="block text-xs text-muted">{v.health.deductions.map((d) => HEALTH_FACTORS[d.key]).join(', ')}</span>}</>
                  )}
                </td>
              ))}
            </Row>
            <Row label="Record Confidence" sub="How complete the history is">
              {c.vehicles.map((v) => (
                <td key={v.vehicle.vehicleRef} className="p-4 align-top"><span className="font-semibold">{CONFIDENCE_LABELS[v.recordConfidence.level]}</span>
                  <span className="block text-xs text-muted">{v.recordConfidence.records} records · {v.recordConfidence.sources} sources</span></td>
              ))}
            </Row>
            {QUESTION_ORDER.map((q, i) => {
              const diff = differs.has(q);
              return (
                <tr key={q} className={diff ? 'bg-warn-fill/40' : undefined}>
                  <th scope="row" className="p-4 align-top">
                    <span className="flex items-start gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-soft text-primary-container"><Icon name={QUESTION_ICONS[q] ?? 'help'} size={18} /></span>
                      <span>
                        <span className="block font-display font-bold">{i + 1}. {QUESTION_TITLES[q]?.short}</span>
                        <span className="block text-xs font-normal text-muted">{QUESTION_TITLES[q]?.ask}</span>
                        {diff ? <span className="chip mt-1 border-warn-line bg-warn-fill text-warn-text">differs</span> : <span className="chip mt-1 border-ok-line bg-ok-fill text-ok-text">same answer</span>}
                      </span>
                    </span>
                  </th>
                  {c.vehicles.map((v) => <Cell key={v.vehicle.vehicleRef} v={v} q={q} />)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The kind of car and the other details, side by side (D-148). */
export function CompareDetails({ c }: { c: Comparison }) {
  return (
    <>
      {/* D-148: the kind of car and the other details, side by side. */}
      {(() => {
        const keys = CAR_DETAIL_KEYS.filter((k) => c.vehicles.some((v) => v.about?.details.some((d) => d.key === k)));
        if (!keys.length) return null;
        return (
          <section aria-labelledby="about-cars">
            <h2 id="about-cars" className="font-display text-2xl font-extrabold text-primary-container md:text-3xl">About these cars</h2>
            <p className="mt-1 text-muted">A maker&apos;s figure is published for the model, not measured on the car.</p>
            <div tabIndex={0} role="region" aria-label="Car details, side by side (scrolls sideways on small screens)" className="mt-5 overflow-x-auto rounded-[14px] border border-line bg-white focus-visible:outline-2 focus-visible:outline-primary-container">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Car details compared across {c.vehicles.length} cars</caption>
                <thead className="bg-soft"><tr>
                  <th scope="col" className="w-60 p-4 text-[11px] font-bold uppercase tracking-wider text-label">Detail</th>
                  {c.vehicles.map((v) => <th key={v.vehicle.vehicleRef} scope="col" className="p-4 font-display text-base font-bold text-ink">{vehicleName(v.vehicle)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {keys.map((k) => (
                    <tr key={k}>
                      <th scope="row" className="p-4 align-top font-display font-bold">{DETAIL_LABELS[k]}</th>
                      {c.vehicles.map((v) => {
                        const d = v.about?.details.find((x) => x.key === k);
                        return <td key={v.vehicle.vehicleRef} className="p-4 align-top">{d ? <><span className="font-semibold">{detailValue(k, d.value)}</span>
                          <span className="block text-xs text-muted">{DETAIL_SOURCE_LABELS[d.source]}</span></> : <span className="text-muted">Not recorded</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}
    </>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" className="p-4 align-top"><span className="block font-display font-bold">{label}</span><span className="block text-xs font-normal text-muted">{sub}</span></th>
      {children}
    </tr>
  );
}

function Cell({ v, q }: { v: FullReport; q: string }) {
  const a = v.questions.find((x) => x.question === q);
  if (!a) return <td className="p-4 align-top text-muted">Not recorded</td>;
  const km = v.facts.find((f) => f.key === 'current_mileage_km');
  return (
    <td className="p-4 align-top">
      <StatusChip status={a.status} label={statusLabel(q, a.status)} />
      {q === 'mileage' && km && <p className="mt-2 font-display text-lg font-extrabold">{factValue(km.key, km.value)}</p>}
      {q === 'valuation' && v.valuation.range && <p className="mt-2 font-display text-lg font-extrabold">{formatUgx(v.valuation.range.lowUgx)} to {formatUgx(v.valuation.range.highUgx)}</p>}
      <p className="mt-1">{headline(a.headlineKey, a.params)}</p>
    </td>
  );
}

/** One car at the top of the comparison. `open` is where its report opens (the buyers' page, or inside a workspace). */
export function CarCard({ v, photo, remove, open }: { v: FullReport; photo?: CarPhoto; remove?: string; open?: string }) {
  const ref = v.vehicle.vehicleRef;
  const score = v.health.insufficient ? null : v.health.score;
  return (
    <article className="card flex flex-col overflow-hidden" aria-label={vehicleName(v.vehicle)}>
      <div className={`relative bg-soft ${photo ? 'aspect-[16/9]' : 'aspect-[16/7]'}`}>
        {photo ? (
          <img src={`/v/${ref}/photo/${photo.photoId}`} alt={`Inspection photo of the ${vehicleName(v.vehicle)}`} className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-primary-container/50"><Icon name="directions_car" size={56} /></span>
        )}
        {v.vehicle.currentPlate && <span className="absolute bottom-3 left-3"><Plate value={v.vehicle.currentPlate} size="sm" /></span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="font-display text-lg font-bold">{vehicleName(v.vehicle)}</h2>
        <div className="mt-3 rounded-lg bg-soft p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-label">Estimated price</p>
          <p className="font-display text-xl font-extrabold text-primary-container">{v.valuation.range ? `${formatUgx(v.valuation.range.lowUgx)} to ${formatUgx(v.valuation.range.highUgx)}` : 'Not enough data'}</p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className={`grid size-12 shrink-0 place-items-center rounded-full border-4 font-display font-extrabold ${score === null ? 'border-na-line text-na-text' : score >= 80 ? 'border-lime text-ink' : score >= 50 ? 'border-warn-line text-warn-text' : 'border-bad-line text-bad-text'}`}>{score ?? 'N/A'}</span>
          <p className="text-sm"><span className="font-semibold">Vehicle Health</span><span className="block text-muted">Record Confidence: {CONFIDENCE_LABELS[v.recordConfidence.level]}</span></p>
        </div>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <Link href={open ?? `/v/${ref}`} className="btn btn-primary flex-1">Open report</Link>
          {remove && <Link href={remove} className="btn btn-ghost" aria-label={`Remove ${vehicleName(v.vehicle)} from the comparison`}><Icon name="close" /></Link>}
        </div>
      </div>
    </article>
  );
}

