'use client';
import { RECORD_LABELS, type FieldSpec } from '@sazo/contracts';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { submitRecord, type EntryState } from '../actions';

const STATUS: Record<string, { text: string; cls: string }> = {
  accepted: { text: 'Received and added to the vehicle', cls: 'border-ok-line bg-ok-fill text-ok-text' },
  needs_review: { text: 'Received. SAZO will check which vehicle it belongs to', cls: 'border-warn-line bg-warn-fill text-warn-text' },
  rejected: { text: 'Not accepted', cls: 'border-bad-line bg-bad-fill text-bad-text' },
};

/** P-05: correcting a record already sent. The new record replaces it; the old one stays in the history. */
export interface Correction { observationId: string; type: string; identifiers: { vin?: string; chassisNumber?: string; plate?: string }; values: Record<string, string> }

export function EntryForm({ source, domain, types, fields, idempotencyKey, correction }: {
  source: string; domain: string; types: string[]; fields: Record<string, FieldSpec[]>; idempotencyKey: string; correction?: Correction;
}) {
  const [state, action, pending] = useActionState<EntryState, FormData>(submitRecord, {});
  const [type, setType] = useState(state.values?.record_type ?? correction?.type ?? types[0]!);
  const v = state.values ?? correction?.values ?? {};
  const item = state.result?.items[0];
  const ids = correction?.identifiers;

  if (item) {
    const s = STATUS[item.status] ?? STATUS.needs_review!;
    return (
      <div className="space-y-3">
        <div role="status" className={`rounded-lg border p-4 ${s.cls}`}>
          <p className="font-semibold">{s.text}</p>
          {item.errors.map((e) => <p key={e.path} className="text-sm text-on-surface">{e.message}</p>)}
          {item.vehicleRef && <p className="mt-1 text-sm text-on-surface">Vehicle <Link className="link sazo-id" href={`/v/${item.vehicleRef}`}>{item.vehicleRef}</Link></p>}
        </div>
        {correction && item.status === 'accepted' && <p className="text-sm">The earlier record is kept in the car&apos;s history, marked corrected, and no longer counts.</p>}
        <a href={correction ? `/partner/${source}?tab=records` : `/partner/${source}`} className="btn btn-primary">{correction ? 'Back to records sent' : 'Enter another record'}</a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="domain" value={domain} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {correction && <input type="hidden" name="corrects" value={correction.observationId} />}
      {ids ? (
        <div className="card space-y-1 p-4">
          <p className="font-semibold">Correcting a record for this car</p>
          <p className="text-sm text-muted">Change what was wrong and send. The earlier record is never edited: it stays in the history, marked corrected.</p>
          <p className="sazo-id text-sm">{[ids.plate, ids.chassisNumber, ids.vin].filter(Boolean).join(' · ')}</p>
          {ids.vin && <input type="hidden" name="vin" value={ids.vin} />}
          {ids.chassisNumber && <input type="hidden" name="chassis_number" value={ids.chassisNumber} />}
          {ids.plate && <input type="hidden" name="plate" value={ids.plate} />}
        </div>
      ) : (
      <fieldset className="card space-y-3 p-4">
        <legend className="px-1 font-semibold">Which vehicle? (at least one)</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label htmlFor="vin" className="label">VIN</label><input id="vin" name="vin" defaultValue={v.vin} className="field sazo-id" autoComplete="off" /></div>
          <div><label htmlFor="chassis_number" className="label">Chassis number</label><input id="chassis_number" name="chassis_number" defaultValue={v.chassis_number} className="field sazo-id" autoComplete="off" /></div>
          <div><label htmlFor="plate" className="label">Number plate</label><input id="plate" name="plate" defaultValue={v.plate} className="field sazo-id" autoComplete="off" /></div>
        </div>
      </fieldset>
      )}
      <fieldset className="card space-y-3 p-4">
        <legend className="px-1 font-semibold">The record</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label htmlFor="record_type" className="label">Type of record</label>
            <select id="record_type" name="record_type" value={type} onChange={(e) => setType(e.target.value)} className="field">
              {types.map((t) => <option key={t} value={t}>{RECORD_LABELS[t] ?? t}</option>)}
            </select></div>
          <div><label htmlFor="date" className="label">Date it happened</label><input id="date" name="date" type="date" required defaultValue={v.date} max={new Date().toISOString().slice(0, 10)} className="field" /></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(fields[type] ?? []).map((f) => (
            <div key={`${type}-${f.path}`}>
              <label htmlFor={f.path} className="label">{f.label}{f.required ? ' *' : ''}</label>
              {f.kind === 'choice' || f.kind === 'boolean' ? (
                <select id={f.path} name={f.path} defaultValue={v[f.path] ?? ''} className="field" required={f.required}>
                  <option value="">Choose</option>
                  {(f.kind === 'boolean' ? ['yes', 'no'] : f.options ?? []).map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              ) : (
                <input id={f.path} name={f.path} defaultValue={v[f.path]} required={f.required} className="field"
                  type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'number' || f.kind === 'integer' ? 'decimal' : undefined}
                  placeholder={f.kind === 'list' ? `separate with ; ${f.options ? `(${f.options.slice(0, 3).join('; ')}…)` : ''}` : undefined} />
              )}
            </div>
          ))}
          {(fields[type] ?? []).length === 0 && <p className="text-sm text-muted">No other details for this kind of record.</p>}
        </div>
      </fieldset>
      {state.errors && <ul role="alert" className="list-disc rounded-lg border border-bad-line bg-bad-fill p-3 pl-8 text-sm font-semibold text-bad-text">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : correction ? 'Send correction' : 'Send record'}</button>
    </form>
  );
}
