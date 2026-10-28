// The inspection booking form (28 Oct 2026): on the buyers' booking page, and in a pop-up on a car's report inside a
// workspace. `back` is the workspace page to come back to, with a note, after sending.
import { api } from '@/lib/api';
import type { Inspector } from '@/lib/types';
import { requestBooking } from '@/app/inspections/actions';

const TYPE: Record<Inspector['type'], string> = { inspector: 'Inspector', inspection_centre: 'Inspection centre' };
const ugandaDay = (n = 0) => new Date(Date.now() + 3 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

export async function BookingForm({ vehicleRef, plate, back, card = true }: { vehicleRef?: string; plate?: string; back?: string; card?: boolean }) {
  const { items } = await api<{ items: Inspector[] }>('/inspectors', { auth: true }).catch(() => ({ items: [] as Inspector[] }));
  const sp = { ref: vehicleRef, plate };
  return (
    <>
    {items.length === 0 ? <p className="card mt-6 p-4">No inspectors are taking bookings on SAZO yet.</p> : (
      <form action={requestBooking} data-draft="inspection-booking" className={card ? 'card mt-6 space-y-4 p-4' : 'space-y-4'}>
        {sp.ref && <input type="hidden" name="ref" value={sp.ref} />}
          {back && <input type="hidden" name="back" value={back} />}
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
    </>
  );
}
