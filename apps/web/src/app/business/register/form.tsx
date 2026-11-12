'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { Icon, type IconName } from '@/components/icon';
import { registerBusiness, type RegisterState } from '../actions';

const TYPES: { v: string; label: string; hint: string; icon: IconName; not: string }[] = [
  { v: 'garage', label: 'Garage', hint: 'Servicing and repairs. The garage app is ready.', icon: 'handyman', not: 'Not a garage?' },
  { v: 'dealer', label: 'Car dealer', hint: 'List your cars for sale and send buyers report links.', icon: 'storefront', not: 'Not a car dealer?' },
  { v: 'inspector', label: 'Independent inspector', hint: 'Record inspections in the SAZO phone app.', icon: 'fact_check', not: 'Not an inspector?' },
  { v: 'inspection_centre', label: 'Inspection centre', hint: 'Record inspections in the SAZO phone app.', icon: 'checklist', not: 'Not an inspection centre?' },
];
const DISTRICTS = ['Kampala', 'Wakiso', 'Mukono', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Mbale', 'Masaka', 'Lira', 'Arua', 'Fort Portal', 'Hoima', 'Kabale', 'Soroti'];

/**
 * `fixed`: the type from the card's button on the Business page (12 Nov 2026). It is shown, not chosen again, so
 * the person becomes the manager of the kind of business they clicked; "Choose another type" goes back to the cards.
 * Without it (the "Register your business" button) the four types are offered.
 */
export function RegisterForm({ defaultType = 'garage', fixed }: { defaultType?: string; fixed?: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerBusiness, {});
  const f = state.fields ?? {};
  const kind = TYPES.find((t) => t.v === fixed);
  return (
    <form action={action} data-draft="business-register" className="mt-6 space-y-5">
      {kind ? (
        <div>
          <input type="hidden" name="type" value={kind.v} />
          <p className="label">Your business</p>
          <div className="flex items-center gap-3 rounded-lg border-2 border-primary-container bg-soft p-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-container text-white"><Icon name={kind.icon} size={22} /></span>
            <span><span className="block font-semibold">{kind.label}</span><span className="text-sm text-muted">{kind.hint}</span></span>
          </div>
          <p className="mt-2 text-sm text-muted">{kind.not} <Link href="/business#who" className="link">Choose another type</Link></p>
        </div>
      ) : (
      <fieldset>
        <legend className="label">What does your business do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TYPES.map((t) => (
            <label key={t.v} className="flex cursor-pointer gap-3 rounded-lg border-2 border-line bg-white p-3 has-[:checked]:border-primary-container has-[:checked]:bg-soft">
              <input type="radio" name="type" value={t.v} defaultChecked={(f.type ?? defaultType) === t.v} className="mt-1 h-5 w-5" />
              <span><span className="block font-semibold">{t.label}</span><span className="text-sm text-muted">{t.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      )}
      <div><label htmlFor="legalName" className="label">Registered business name *</label>
        <input id="legalName" name="legalName" required minLength={2} maxLength={200} defaultValue={f.legalName} className="field" placeholder="e.g. Ntinda Auto Clinic Ltd" /></div>
      <div><label htmlFor="tradingName" className="label">Name customers know you by</label>
        <input id="tradingName" name="tradingName" maxLength={200} defaultValue={f.tradingName} className="field" placeholder="e.g. Ntinda Auto Clinic" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="registrationNumber" className="label">Registration number (URSB)</label>
          <input id="registrationNumber" name="registrationNumber" maxLength={60} defaultValue={f.registrationNumber} className="field" /></div>
        <div><label htmlFor="district" className="label">District</label>
          <input id="district" name="district" list="districts" maxLength={80} defaultValue={f.district} className="field" />
          <datalist id="districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist></div>
      </div>
      <div><label htmlFor="contactPhone" className="label">Business phone</label>
        <input id="contactPhone" name="contactPhone" type="tel" inputMode="tel" defaultValue={f.contactPhone} className="field" placeholder="0772 123 456" /></div>
      {state.error && <p role="alert" className="font-semibold text-bad-text">{state.error}</p>}
      <p className="text-sm text-muted">You will be the manager of this business on SAZO and can add your staff after approval.</p>
      <button className="btn btn-primary w-full sm:w-auto" disabled={pending}>{pending ? 'Registering…' : 'Register business'}</button>
    </form>
  );
}
