import { EVENT_LABELS, RECORD_LABELS, formatDate, formatKm } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { VehicleHeader } from '@/components/vehicle-header';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Summary, Visit } from '@/lib/types';
import { Notice, type SP } from '../../admin/notice';
import { answerVisit } from '../actions';

export const metadata: Metadata = { title: 'Garage visits', robots: { index: false } };

export default async function Visits({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: SP }) {
  const { ref } = await params;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/my-cars/${ref}`);
  const sp = await searchParams;
  const visits = await api<{ items: Visit[] }>(`/me/cars/${ref}/visits`, { auth: true }).then((r) => r.items).catch((err) => {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) redirect('/my-cars');
    throw err;
  });
  const summary = await api<Summary>(`/vehicles/${ref}/summary`).catch(() => undefined);
  const open = visits.filter((v) => v.canAnswer);
  return (
    <>
      {summary && <VehicleHeader v={summary.vehicle} asOf={summary.asOf} />}
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <Link href="/my-cars" className="link text-sm"><Icon name="arrow_back" size={16} className="mr-1 inline align-[-3px]" />My cars</Link>
        <h1 className="mt-2 font-display text-2xl font-bold">Garage visits</h1>
        <p className="mb-4 mt-1 text-muted">Was your car really serviced or repaired here? Your answer as the owner counts more than anyone else&apos;s. You can only answer for visits since the car became yours.</p>
        <Notice done={sp.done} error={sp.error} />
        {visits.length === 0 ? <p className="card p-4">No garage visits recorded for this car yet.</p> : (
          <>
            {open.length > 0 && <p className="mb-3 font-semibold">{open.length} {open.length === 1 ? 'visit needs' : 'visits need'} your answer.</p>}
            <ul className="space-y-3">
              {visits.map((v) => (
                <li key={v.eventId} className="card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h2 className="font-display font-semibold">{EVENT_LABELS[v.type] ?? 'Record'} · {v.sourceLabel.replace(/^Garage record · /, '')}</h2>
                    <time className="text-sm font-semibold text-label" dateTime={v.time.at ?? undefined}>{formatDate(v.time.at, v.time.precision)}</time>
                  </div>
                  <p className="text-sm text-muted">{(v.params.records ?? []).map((t) => RECORD_LABELS[t] ?? t).join(' · ')}{v.mileageKm !== null ? ` · ${formatKm(v.mileageKm)}` : ''}</p>
                  {v.ownerAnswer ? (
                    <p className={`chip mt-2 ${v.ownerAnswer === 'confirmed' ? 'border-ok-line bg-ok-fill text-ok-text' : 'border-bad-line bg-bad-fill text-bad-text'}`}>
                      <Icon name={v.ownerAnswer === 'confirmed' ? 'check_circle' : 'report'} size={14} />You {v.ownerAnswer} this visit</p>
                  ) : v.canAnswer ? (
                    <form action={answerVisit} className="mt-3 space-y-2">
                      <input type="hidden" name="ref" value={ref} /><input type="hidden" name="eventId" value={v.eventId} />
                      <label htmlFor={`c-${v.eventId}`} className="label">Anything to add? (optional)</label>
                      <input id={`c-${v.eventId}`} name="comment" maxLength={500} className="field" placeholder="e.g. I was never at this garage" />
                      <div className="flex flex-wrap gap-2">
                        <button name="response" value="confirmed" className="btn btn-primary"><Icon name="thumb_up" />Yes, this happened</button>
                        <button name="response" value="disputed" className="btn btn-ghost"><Icon name="thumb_down" />No, this is wrong</button>
                      </div>
                    </form>
                  ) : <p className="mt-2 text-sm text-muted">Before the car was yours.</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
