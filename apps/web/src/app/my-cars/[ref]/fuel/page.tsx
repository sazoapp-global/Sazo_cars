// The fuel log (D-148): the owner logs each fill-up; with two full tanks SAZO works out how far the car goes on a
// litre. Buyers see only the owners' average on the report (from 3 measured tanks), never who logged it.
import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { VehicleHeader } from '@/components/vehicle-header';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { FullReport, Summary } from '@/lib/types';
import { Notice, type SP } from '../../../admin/notice';
import { addFillup, removeFillup } from '../../actions';

export const metadata: Metadata = { title: 'Fuel log', robots: { index: false } };

interface Fillup { id: string; filledOn: string; litres: number; odometerKm: number; fullTank: boolean; kmPerL: number | null }
interface Log { items: Fillup[]; average: number | null; measuredTanks: number }

const n = (v: number, digits = 1) => v.toLocaleString('en-GB', { maximumFractionDigits: digits });

export default async function FuelLog({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: SP }) {
  const { ref } = await params;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/my-cars/${ref}/fuel`);
  const sp = await searchParams;
  const log = await api<Log>(`/me/cars/${ref}/fuel`, { auth: true }).catch((err) => {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) redirect('/my-cars');
    throw err;
  });
  const [summary, report] = await Promise.all([
    api<Summary>(`/vehicles/${ref}/summary`).catch(() => undefined),
    api<FullReport>(`/vehicles/${ref}/report`, { auth: true }).catch(() => undefined),
  ]);
  const maker = report?.about?.details.find((d) => d.key === 'fuelKmPerL');
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  return (
    <>
      {summary && <VehicleHeader v={summary.vehicle} asOf={summary.asOf} />}
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <Link href="/my-cars" className="link text-sm"><Icon name="arrow_back" size={16} className="mr-1 inline align-[-3px]" />My cars</Link>
        <h1 className="mt-2 font-display text-2xl font-bold">Fuel log</h1>
        <p className="mb-4 mt-1 text-muted">Log each time you fill the tank. With two full tanks SAZO works out how far the car goes on a litre. Buyers see only the average from owners, never your name.</p>
        <Notice done={sp.done} error={sp.error} />
        <form action={addFillup} className="card grid gap-3 p-4 sm:grid-cols-4" aria-label="Add a fill-up">
          <input type="hidden" name="ref" value={ref} />
          <div><label htmlFor="filledOn" className="label">Date</label><input id="filledOn" name="filledOn" type="date" max={today} defaultValue={today} required className="field" /></div>
          <div><label htmlFor="litres" className="label">Litres</label><input id="litres" name="litres" inputMode="decimal" required className="field tabular-nums" placeholder="38.5" /></div>
          <div><label htmlFor="odometerKm" className="label">Mileage now (km)</label><input id="odometerKm" name="odometerKm" inputMode="numeric" required className="field tabular-nums" placeholder="132,410" /></div>
          <div><label htmlFor="fullTank" className="label">Filled to the top?</label>
            <select id="fullTank" name="fullTank" className="field" defaultValue="yes"><option value="yes">Yes, full tank</option><option value="no">No</option></select></div>
          <div className="sm:col-span-4"><button className="btn btn-primary"><Icon name="add" />Add fill-up</button></div>
        </form>
        <section aria-labelledby="fills" className="mt-6">
          <h2 id="fills" className="sr-only">Your fill-ups</h2>
          {log.items.length === 0 ? <p className="text-muted">No fill-ups yet. Start with a full tank.</p> : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted"><th className="px-4 py-2">Date</th><th>Litres</th><th>Mileage</th><th>Full tank</th><th>km per litre</th><th><span className="sr-only">Remove</span></th></tr></thead>
                <tbody>
                  {log.items.map((f) => (
                    <tr key={f.id} className="border-t border-line">
                      <td className="px-4 py-2">{formatDate(f.filledOn)}</td>
                      <td className="tabular-nums">{n(f.litres, 2)}</td>
                      <td className="tabular-nums">{f.odometerKm.toLocaleString('en-GB')} km</td>
                      <td>{f.fullTank ? 'Yes' : 'No'}</td>
                      <td className="tabular-nums">{f.kmPerL !== null ? n(f.kmPerL) : <span className="text-muted">·</span>}</td>
                      <td className="pr-3 text-right">
                        <form action={removeFillup}><input type="hidden" name="ref" value={ref} /><input type="hidden" name="id" value={f.id} />
                          <button className="link text-sm" aria-label={`Remove the fill-up of ${formatDate(f.filledOn)}`}>Remove</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 font-semibold">
            {log.average !== null ? <>Your average: {n(log.average)} km per litre</> : 'Your average shows after two full tanks.'}
            {maker && <span className="font-normal text-muted"> · maker&apos;s figure {n(Number(maker.value))}{maker.source === 'maker_test' ? ' (test data)' : ''}</span>}
          </p>
          <p className="mt-1 text-sm text-muted">The report shows the owners&apos; average once there are 3 measured tanks.</p>
        </section>
      </div>
    </>
  );
}
