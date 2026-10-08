import { factValue } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ConcernNotices } from '@/components/concern-notices';
import { Confidence } from '@/components/confidence';
import { FullReportView, NextSteps } from '@/components/full-report';
import { ModelCommunity } from '@/components/model-community';
import { Icon } from '@/components/icon';
import { QuestionCard } from '@/components/question-card';
import { VehicleHeader } from '@/components/vehicle-header';
import { api } from '@/lib/api';
import type { MyCar } from '@/lib/types';
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

  if (data.kind === 'summary') {
    const s = data.summary;
    return (
      <>
        <VehicleHeader v={s.vehicle} asOf={s.asOf} />
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
          <ConcernNotices notices={s.notices} />
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
  const [saved, mine] = await Promise.all([
    api<{ saved: boolean }>(`/me/saved-checks/${ref}`, { auth: true }).then((x) => x.saved).catch(() => false),
    api<{ items: MyCar[] }>('/me/cars', { auth: true }).then((x) => x.items.find((c) => c.vehicleRef === ref && c.status !== 'rejected')).catch(() => undefined),
  ]);
  return (
    <>
      <VehicleHeader v={r.vehicle} asOf={r.asOf} tab="report" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <div className="flex flex-wrap gap-2 print:hidden">
          <form action={saved ? unsaveCar : saveCar}><input type="hidden" name="ref" value={ref} />
            <button className="btn btn-ghost" aria-pressed={saved}><Icon name={saved ? 'bookmark_added' : 'bookmark'} />{saved ? 'Saved' : 'Save this car'}</button></form>
          <Link href={`/compare?r=${ref}`} className="btn btn-ghost"><Icon name="compare_arrows" />Compare</Link>
          <form action={shareReport}><input type="hidden" name="ref" value={ref} />
            <button className="btn btn-ghost"><Icon name="share" />Share or save as PDF</button></form>
          {mine ? (
            <Link href={mine.status === 'verified' ? `/my-cars/${ref}` : '/my-cars'} className="btn btn-ghost"><Icon name="key" />{mine.status === 'verified' ? 'Your car' : 'Logbook being checked'}</Link>
          ) : (
            <form action={claimCar}><input type="hidden" name="ref" value={ref} />
              <button className="btn btn-ghost"><Icon name="key" />This is my car</button></form>
          )}
        </div>
        {error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{error}</p>}
        <FullReportView r={r} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/v/${ref}/timeline`} className="btn btn-ghost"><Icon name="timeline" />See the timeline</Link>
          <Link href={`/v/${ref}/evidence`} className="btn btn-ghost"><Icon name="receipt_long" />See every record</Link>
        </div>
        {r.model && <ModelCommunity vehicleRef={ref} modelId={r.model.modelId} done={cdone} error={cerror} />}
        <NextSteps />
        <p className="text-xs text-muted">Rule set {r.ruleSetVersion} · Calculated {factValue('first_registration_date', r.asOf.slice(0, 10))}</p>
      </div>
    </>
  );
}
