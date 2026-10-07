import { FACT_LABELS, factValue, formatUgx, headline } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Confidence } from '@/components/confidence';
import { HealthDial } from '@/components/health-dial';
import { Icon } from '@/components/icon';
import { QuestionCard } from '@/components/question-card';
import { VehicleHeader } from '@/components/vehicle-header';
import { vehicleName } from '@/components/vehicle-card';
import { loadVehicle } from './load';

type Props = { params: Promise<{ ref: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ref } = await params;
  return { title: `Vehicle ${ref}`, robots: { index: false } };
}

const FACT_ORDER = ['current_mileage_km', 'first_registration_date', 'import_origin', 'owner_count', 'usage_type', 'current_colour', 'fuel', 'transmission', 'finance_status', 'title_status'];

export default async function VehiclePage({ params }: Props) {
  const { ref } = await params;
  const data = await loadVehicle(ref);

  if (data.kind === 'summary') {
    const s = data.summary;
    return (
      <>
        <VehicleHeader v={s.vehicle} asOf={s.asOf} />
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
          <div className="card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <Confidence rc={s.recordConfidence} />
            <div className="rounded-lg bg-soft p-4 md:max-w-sm">
              <p className="font-semibold">See the evidence behind each answer</p>
              <p className="text-sm text-muted">Sign in (free) for the health score, price estimate, mileage history and every record.</p>
              <Link href={`/sign-in?next=/v/${ref}`} className="btn btn-primary mt-3 w-full">Sign in to see details</Link>
            </div>
          </div>
          {s.questions.map((q) => <QuestionCard key={q.question} q={q} detailed={false} />)}
          <NextSteps />
        </div>
      </>
    );
  }

  const r = data.report;
  const facts = new Map(r.facts.map((f) => [f.key, f]));
  const valuation = r.questions.find((q) => q.question === 'valuation');
  return (
    <>
      <VehicleHeader v={r.vehicle} asOf={r.asOf} tab="report" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
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

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/v/${ref}/timeline`} className="btn btn-ghost"><Icon name="timeline" />See the timeline</Link>
          <Link href={`/v/${ref}/evidence`} className="btn btn-ghost"><Icon name="receipt_long" />See every record</Link>
        </div>
        <NextSteps />
        <p className="text-xs text-muted">Rule set {r.ruleSetVersion} · Calculated {factValue('first_registration_date', r.asOf.slice(0, 10))}</p>
      </div>
    </>
  );
}

function NextSteps() {
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
