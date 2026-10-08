import Link from 'next/link';
import { api } from '@/lib/api';
import type { Decision, Summary } from '@/lib/types';
import { decideMatch } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { day } from '../labels';
import { Forbidden, Notice, type SP } from '../notice';

const IDENT: Record<string, string> = { vin: 'VIN', chassisNumber: 'Chassis', plate: 'Plate', engineNumber: 'Engine no.' };

export default async function Matches({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/matches');
  const sp = await searchParams;
  const data = await adminFetch<{ items: Decision[] }>('/admin/resolutions?outcome=ambiguous');
  const refs = data === 'forbidden' ? [] : [...new Set(data.items.flatMap((d) => d.candidateVehicleRefs))];
  const cars = new Map(await Promise.all(refs.map(async (r) => [r, await api<Summary>(`/vehicles/${r}/summary`).catch(() => undefined)] as const)));
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Vehicle matches</h1>
      <p className="mb-4 text-muted">A record arrived and SAZO could not be sure which car it belongs to — for example a new chassis number with a plate that is on a car entered by its owner. Pick the car, make a new one, or reject the record.</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="deciding vehicle matches" /> : data.items.length === 0 ? <p className="text-muted">Nothing waiting.</p> : (
        <ul className="space-y-4">
          {data.items.map((d) => (
            <li key={d.decisionId} className="card p-4">
              <p className="text-sm text-muted">Arrived {day(d.decidedAt)}</p>
              <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                {Object.entries(d.presentedIdentifiers).map(([k, v]) => <div key={k}><dt className="text-[11px] font-bold uppercase tracking-wider text-label">{IDENT[k] ?? k}</dt><dd className="sazo-id font-semibold">{v}</dd></div>)}
              </dl>
              <form action={decideMatch} className="mt-3 space-y-3">
                <input type="hidden" name="decisionId" value={d.decisionId} />
                <fieldset>
                  <legend className="label">Which car is it?</legend>
                  {d.candidateVehicleRefs.map((r) => {
                    const s = cars.get(r);
                    return (
                      <label key={r} className="flex items-start gap-2 rounded-lg border border-line p-3">
                        <input type="radio" name="choice" value={`matched:${r}`} required className="mt-1 h-5 w-5" />
                        <span><span className="font-semibold">{s ? [s.vehicle.year, s.vehicle.make, s.vehicle.model].filter(Boolean).join(' ') || 'Vehicle' : 'Vehicle'}</span>
                          {' '}<span className="sazo-id text-sm">{r}</span>{s?.vehicle.currentPlate ? ` · plate ${s.vehicle.currentPlate}` : ''}{s?.vehicle.status === 'provisional' ? ' · entered by owner, not yet confirmed' : ''}
                          {' '}<Link className="link text-sm" href={`/v/${r}/evidence`} target="_blank">records</Link></span>
                      </label>
                    );
                  })}
                  <label className="mt-2 flex items-center gap-2 rounded-lg border border-line p-3"><input type="radio" name="choice" value="created_new" className="h-5 w-5" />A different car — create a new vehicle</label>
                  <label className="mt-2 flex items-center gap-2 rounded-lg border border-line p-3"><input type="radio" name="choice" value="rejected" className="h-5 w-5" />Reject this record</label>
                </fieldset>
                <div><label htmlFor={`reason-${d.decisionId}`} className="label">Reason</label>
                  <input id={`reason-${d.decisionId}`} name="reason" required minLength={3} className="field" placeholder="e.g. Owner confirmed by phone; chassis photo matches" /></div>
                <button className="btn btn-primary">Record decision</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
