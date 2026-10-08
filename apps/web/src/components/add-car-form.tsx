'use client';
import { useActionState } from 'react';
import { addCar, type AddCarState } from '@/app/buyer-actions';

/** Not-found flow (D-032): add the car; SAZO shows it as "not yet confirmed" until an official record matches (P-010). */
export function AddCarForm({ plate, vin }: { plate?: string; vin?: string }) {
  const [state, action, pending] = useActionState<AddCarState, FormData>(addCar, {});
  return (
    <form action={action} className="card mt-6 space-y-3 p-4">
      <h2 className="font-display text-lg font-semibold">Add this car to SAZO</h2>
      <p className="text-sm text-muted">If you own or are looking at this car, add its details. It will show as <strong>not yet confirmed</strong> until an official record matches it, and records added later will build its history.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor="ac-plate" className="label">Number plate</label><input id="ac-plate" name="plate" defaultValue={plate} className="field sazo-id" /></div>
        <div><label htmlFor="ac-chassis" className="label">Chassis number</label><input id="ac-chassis" name="chassisNumber" className="field sazo-id" /></div>
        <div><label htmlFor="ac-vin" className="label">VIN (17 characters)</label><input id="ac-vin" name="vin" defaultValue={vin} maxLength={17} className="field sazo-id" /></div>
        <div><label htmlFor="ac-make" className="label">Make *</label><input id="ac-make" name="make" required placeholder="Toyota" className="field" /></div>
        <div><label htmlFor="ac-model" className="label">Model *</label><input id="ac-model" name="model" required placeholder="Premio" className="field" /></div>
        <div><label htmlFor="ac-year" className="label">Year *</label><input id="ac-year" name="year" required inputMode="numeric" maxLength={4} placeholder="2014" className="field" /></div>
        <div><label htmlFor="ac-colour" className="label">Colour</label><input id="ac-colour" name="colour" className="field" /></div>
      </div>
      {state.error && <p role="alert" className="font-semibold text-bad-text">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Adding…' : 'Add car'}</button>
    </form>
  );
}
