import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, isSignedIn } from '@/lib/api';
import type { Inspector } from '@/lib/types';
import { requestBooking } from '../actions';

export const metadata: Metadata = { title: 'Book an inspection', robots: { index: false } };

const TYPE: Record<Inspector['type'], string> = { inspector: 'Inspector', inspection_centre: 'Inspection centre' };
const ugandaDay = (n = 0) => new Date(Date.now() + 3 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

export default async function BookInspection({ searchParams }: { searchParams: Promise<{ ref?: string; plate?: string; error?: string }> }) {
  const sp = await searchParams;
  const here = `/inspections/book?${new URLSearchParams({ ...(sp.ref ? { ref: sp.ref } : {}), ...(sp.plate ? { plate: sp.plate } : {}) })}`;
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const { items } = await api<{ items: Inspector[] }>('/inspectors', { auth: true });
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      {sp.ref && <Link href={`/v/${sp.ref}`} className="link text-sm">← Back to the report</Link>}
      <h1 className="mt-2 font-display text-2xl font-bold">Book an inspection</h1>
      <p className="mt-1 text-muted">Ask an inspector approved by SAZO to check the car before you buy. They reply with a day and time, or say they cannot do it. You agree the price with them directly: no money goes through SAZO.</p>
      {sp.error && <p role="alert" className="mt-4 rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
      {items.length === 0 ? <p className="card mt-6 p-4">No inspectors are taking bookings on SAZO yet.</p> : (
        <form action={requestBooking} className="card mt-6 space-y-4 p-4">
          {sp.ref && <input type="hidden" name="ref" value={sp.ref} />}
          <fieldset>
            <legend className="label">Inspector *</legend>
            <div className="mt-1 space-y-2">
              {items.map((o, i) => (
                <label key={o.organisationId} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-primary-container">
                  <input type="radio" name="organisationId" value={o.organisationId} required defaultChecked={i === 0} className="mt-1 accent-[#0033aa]" />
                  <span><span className="font-semibold">{o.name}</span><span className="block text-sm text-muted">{TYPE[o.type]}{o.district ? ` · ${o.district}` : ''}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 md:grid-cols-2">
            <div><label htmlFor="plate" className="label">Number plate *</label><input id="plate" name="plate" required minLength={2} maxLength={15} defaultValue={sp.plate} className="field sazo-id" autoComplete="off" /></div>
            <div><label htmlFor="preferredDate" className="label">Preferred day *</label><input id="preferredDate" name="preferredDate" type="date" required min={ugandaDay()} max={ugandaDay(60)} defaultValue={ugandaDay(1)} className="field" /></div>
          </div>
          <div><label htmlFor="place" className="label">Where is the car?</label><input id="place" name="place" maxLength={120} placeholder="For example: Ntinda, near the stage" className="field" /></div>
          <div><label htmlFor="note" className="label">Anything the inspector should know?</label><textarea id="note" name="note" maxLength={500} rows={3} className="field" /></div>
          <p className="text-sm text-muted">Your phone number is shared with the inspector only when they accept.</p>
          <button className="btn btn-primary">Send request</button>
        </form>
      )}
    </div>
  );
}
