'use client';
// The kind of car and "More details" on a dealer's car (D-148). The kind fills itself in from the chassis code or
// the model as the dealer types (SAZO's model list); the dealer can change it. The details fill in from the model
// list too, and only the ones the dealer changes are sent as the dealer's own record.
import { DRIVES, DRIVE_LABELS, KIND_LABELS, STEERING_LABELS, STEERING_SIDES, VEHICLE_KINDS, kindLabel, type CarSpecs, type VehicleKind } from '@sazo/contracts';
import { useEffect, useRef, useState } from 'react';
import { identifyCar, type Identified } from './identify-action';

const EVENT = 'sazo:car-spec';
const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value?.trim() ?? '';

/** "Kind of car *": filled in when SAZO can tell; a note says how. */
export function KindField({ kind, chassis, disabled }: { kind?: VehicleKind | null; chassis?: string; disabled?: boolean }) {
  const [value, setValue] = useState<string>(kind ?? '');
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'ask' } | undefined>();
  const touched = useRef(!!kind);
  useEffect(() => {
    if (disabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = '';
    const check = () => {
      const q = { make: val('make'), model: val('model'), chassis: val('anchor') || chassis || '' };
      const key = JSON.stringify(q);
      if (key === last || (!q.model && !q.chassis)) return;
      last = key;
      identifyCar(q).then((r: Identified | null) => {
        if (!r) return;
        window.dispatchEvent(new CustomEvent(EVENT, { detail: r }));
        if (r.kind) {
          if (!touched.current) setValue(r.kind);
          setNote({ tone: 'ok', text: r.via === 'chassis_code'
            ? `Filled in from the chassis number (${r.code ?? 'its model code'} is a ${r.spec?.model ?? kindLabel(r.kind)}). Change it if it is wrong.`
            : `Filled in from the model. Change it if it is wrong.` });
        } else if (r.reason === 'mixed_model' && r.kinds?.length) {
          setNote({ tone: 'ask', text: `This model comes as ${r.kinds.map((k) => KIND_LABELS[k]).join(' or ')}. Choose the kind, or add the chassis number.` });
        } else setNote(undefined);
      }).catch(() => undefined);
    };
    const onType = () => { clearTimeout(timer); timer = setTimeout(check, 450); };
    const ids = ['make', 'model', 'anchor'];
    ids.forEach((id) => document.getElementById(id)?.addEventListener('input', onType));
    check();
    return () => { clearTimeout(timer); ids.forEach((id) => document.getElementById(id)?.removeEventListener('input', onType)); };
  }, [chassis, disabled]);
  return (
    <div>
      <label htmlFor="kind" className="label">Kind of car *</label>
      <select id="kind" name="kind" className="field" value={value} disabled={disabled} aria-describedby="kind-note"
        onChange={(e) => { touched.current = true; setValue(e.target.value); }}>
        <option value="">Choose</option>
        {VEHICLE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>
      <p id="kind-note" aria-live="polite" className={`mt-1 text-sm ${note?.tone === 'ok' ? 'text-ok-text' : 'text-muted'}`}>{note?.text ?? (value ? '' : 'Needed when you type the make and model.')}</p>
    </div>
  );
}

type SpecKey = keyof CarSpecs;
const NUMBERS: [SpecKey, string, string][] = [
  ['seats', 'Seats', 'numeric'], ['doors', 'Doors', 'numeric'], ['cylinders', 'Cylinders', 'numeric'], ['powerHp', 'Engine power (hp)', 'numeric'],
  ['fuelKmPerL', 'Fuel consumption (km per litre)', 'decimal'], ['loadTonnes', 'Load capacity (tonnes)', 'decimal'], ['gvwTonnes', 'Gross vehicle weight (tonnes)', 'decimal'], ['axles', 'Number of axles', 'numeric'],
];

/** "More details (optional)": filled in from SAZO's model list when the kind is identified; the dealer changes what differs. */
export function MoreDetails({ specs, disabled, open }: { specs?: CarSpecs; disabled?: boolean; open?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(specs ?? {}).map(([k, v]) => [k, String(v)])));
  const edited = useRef(new Set<string>(Object.keys(specs ?? {})));
  const [from, setFrom] = useState<string>();
  const [isOpen, setOpen] = useState(!!open);
  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent<Identified>).detail;
      const s = r.spec;
      if (!s) return;
      setValues((cur) => {
        const next = { ...cur };
        for (const [k] of [...NUMBERS, ['drive'], ['steering']] as [SpecKey][]) {
          const v = s[k as keyof typeof s];
          if (!edited.current.has(k) && v !== null && v !== undefined) next[k] = String(v);
        }
        return next;
      });
      setOpen(true);
      setFrom(`Filled in from SAZO's list for a ${s.make} ${s.model}${s.basis === 'simulated' ? ' (test data)' : ''}. Change any that are different on this car.`);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const set = (k: string, v: string) => { edited.current.add(k); setValues((cur) => ({ ...cur, [k]: v })); };
  return (
    <details className="rounded-lg border border-line p-4 sm:col-span-2" open={isOpen} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer font-semibold">More details (optional)</summary>
      <p className="mt-1 text-sm text-muted">{from ?? 'Seats, engine power, fuel consumption and the rest. Filled in from SAZO’s list once the kind of car is known.'}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {NUMBERS.map(([k, label, mode]) => (
          <div key={k}><label htmlFor={`spec-${k}`} className="label">{label}</label>
            <input id={`spec-${k}`} name={`spec_${k}`} inputMode={mode as 'numeric' | 'decimal'} className="field tabular-nums" disabled={disabled}
              value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></div>
        ))}
        <div><label htmlFor="spec-drive" className="label">Drive</label>
          <select id="spec-drive" name="spec_drive" className="field" disabled={disabled} value={values.drive ?? ''} onChange={(e) => set('drive', e.target.value)}>
            <option value="">Not given</option>{DRIVES.map((d) => <option key={d} value={d}>{DRIVE_LABELS[d]}</option>)}</select></div>
        <div><label htmlFor="spec-steering" className="label">Steering side</label>
          <select id="spec-steering" name="spec_steering" className="field" disabled={disabled} value={values.steering ?? ''} onChange={(e) => set('steering', e.target.value)}>
            <option value="">Not given</option>{STEERING_SIDES.map((s) => <option key={s} value={s}>{STEERING_LABELS[s]}</option>)}</select></div>
      </div>
    </details>
  );
}
