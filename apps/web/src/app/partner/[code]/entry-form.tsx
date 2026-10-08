'use client';
import { RECORD_LABELS, type FieldSpec } from '@sazo/contracts';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { submitRecord, type EntryState } from '../actions';

const STATUS: Record<string, { text: string; cls: string }> = {
  accepted: { text: 'Received and added to the vehicle', cls: 'border-ok-line bg-ok-fill text-ok-text' },
  needs_review: { text: 'Received — SAZO will check which vehicle it belongs to', cls: 'border-warn-line bg-warn-fill text-warn-text' },
  rejected: { text: 'Not accepted', cls: 'border-bad-line bg-bad-fill text-bad-text' },
};

export function EntryForm({ source, domain, types, fields, idempotencyKey }: {
  source: string; domain: string; types: string[]; fields: Record<string, FieldSpec[]>; idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<EntryState, FormData>(submitRecord, {});
  const [type, setType] = useState(state.values?.record_type ?? types[0]!);
  const v = state.values ?? {};
  const item = state.result?.items[0];

  if (item) {
    const s = STATUS[item.status] ?? STATUS.needs_review!;
    return (
      <div className="space-y-3">
        <div role="status" className={`rounded-lg border p-4 ${s.cls}`}>
          <p className="font-semibold">{s.text}</p>
          {item.errors.map((e) => <p key={e.path} className="text-sm text-on-surface">{e.message}</p>)}
          {item.vehicleRef && <p className="mt-1 text-sm text-on-surface">Vehicle <Link className="link sazo-id" href={`/v/${item.vehicleRef}`}>{item.vehicleRef}</Link></p>}
        </div>
        <a href={`/partner/${source}`} className="btn btn-primary">Enter another record</a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="domain" value={domain} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <fieldset className="card space-y-3 p-4">
        <legend className="px-1 font-semibold">Which vehicle? (at least one)</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label htmlFor="vin" className="label">VIN</label><input id="vin" name="vin" defaultValue={v.vin} className="field sazo-id" autoComplete="off" /></div>
          <div><label htmlFor="chassis_number" className="label">Chassis number</label><input id="chassis_number" name="chassis_number" defaultValue={v.chassis_number} className="field sazo-id" autoComplete="off" /></div>
          <div><label htmlFor="plate" className="label">Number plate</label><input id="plate" name="plate" defaultValue={v.plate} className="field sazo-id" autoComplete="off" /></div>
        </div>
      </fieldset>
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
                  <option value="">—</option>
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
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Send record'}</button>
    </form>
  );
}
