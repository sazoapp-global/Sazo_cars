import { QUESTION_TITLES, formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { statusIcon } from '@/components/status';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { vehicleName } from '@/components/vehicle-card';
import { api, isSignedIn } from '@/lib/api';
import type { SavedCheck } from '@/lib/types';
import { unsaveCar } from '../buyer-actions';

export const metadata: Metadata = { title: 'Saved cars' };

export default async function Saved() {
  if (!(await isSignedIn())) redirect('/sign-in?next=/saved');
  const { items } = await api<{ items: SavedCheck[] }>('/me/saved-checks', { auth: true });
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Saved cars</h1>
      <p className="mt-1 text-muted">Answers update when new records arrive. Tick 2 or 3 cars to compare them.</p>
      {items.length === 0 ? <p className="card mt-6 p-4">Nothing saved yet. Open a car&apos;s report and tap <strong>Save this car</strong>.</p> : (
        <form action="/compare" method="get" className="mt-6 space-y-3">
          {items.map((i) => (
            <div key={i.vehicleRef} className="card flex items-start gap-3 p-4">
              <input type="checkbox" name="r" value={i.vehicleRef} aria-label={`Compare ${vehicleName(i.summary.vehicle)}`} className="mt-1 h-6 w-6 shrink-0 accent-[#0033aa]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">{i.summary.vehicle.currentPlate && <Plate value={i.summary.vehicle.currentPlate} size="sm" />}<span className="text-xs text-muted">saved {formatDate(i.savedAt)}</span></div>
                <Link href={`/v/${i.vehicleRef}`} className="mt-1 block font-display text-lg font-bold hover:underline">{vehicleName(i.summary.vehicle)}</Link>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Answers">
                  {i.summary.questions.map((q) => {
                    const s = statusIcon(q.status);
                    return <li key={q.question} className={`flex items-center gap-1 font-semibold ${s.cls}`}><Icon name={s.icon} size={14} />{QUESTION_TITLES[q.question]?.short}</li>;
                  })}
                </ul>
              </div>
              <button formAction={unsaveCar} name="ref" value={i.vehicleRef} className="shrink-0 p-2 text-label hover:text-bad-text" aria-label={`Remove ${vehicleName(i.summary.vehicle)}`}><Icon name="delete" /></button>
            </div>
          ))}
          <input type="hidden" name="back" value="/saved" />
          <button className="btn btn-primary"><Icon name="list_alt" />Compare selected</button>
        </form>
      )}
    </div>
  );
}
