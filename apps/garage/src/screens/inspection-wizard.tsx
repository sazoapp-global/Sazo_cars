// An inspection in short steps (P-004): identity, mileage, paint thickness, structure, tyres, battery,
// defects, photos, result. Every change is saved on the phone at once and sent to SAZO when there's
// signal (offline-first). Sending needs signal.
import {
  PANELS, PANEL_LABELS, REPAINT_MICRONS, STRUCTURE_AREAS, STRUCTURE_LABELS, formatDate, formatKm, inspectionErrors,
  type InspectionForm, type Panel,
} from '@sazo/contracts';
import { useCallback, useRef, useState, useEffect } from 'react';
import { PlateText } from '../components/bits';
import { Icon } from '../components/icon';
import { PhotoButton } from '../components/photo-button';
import { ApiError, OfflineError, request } from '../lib/api';
import { CAR_PHOTO_SLOTS, forgetInspection, getInspection, saveInspection, type LocalInspection } from '../lib/db';
import { go, useOnline } from '../lib/route';
import { inspectionForServer, syncInspection } from '../lib/sync';
import type { Candidate, Garage, InspectionSubmitResult, InspectionWarning, Lookup, Me } from '../lib/types';
import { uuidv7 } from '../lib/uuid';

const STEPS = ['Car', 'Mileage', 'Identity', 'Paint', 'Condition', 'Photos', 'Result'] as const;
const FAKE_ID = '00000000-0000-7000-8000-000000000000';

type Update = (fn: (x: LocalInspection) => LocalInspection) => void;
type SetForm = (fn: (f: InspectionForm) => InspectionForm) => void;
type StepProps = { i: LocalInspection; update: Update; setForm: SetForm };

/** The checklist as the server will see it once the photos taken on the phone are uploaded. */
function asIfUploaded(i: LocalInspection): InspectionForm {
  const f = i.form;
  return {
    ...f,
    ...(f.mileage ? { mileage: { ...f.mileage, ...(i.photos.odometer ? { odometerPhotoId: FAKE_ID } : {}) } } : {}),
    ...(f.identity ? { identity: { ...f.identity, ...(i.photos.chassis ? { chassisPhotoId: FAKE_ID } : {}) } } : {}),
    photoIds: CAR_PHOTO_SLOTS.filter(([slot]) => i.photos[slot]).map(() => FAKE_ID),
  };
}

export function InspectionWizard({ id, workplace, me }: { id: string; workplace: Garage; me: Me }) {
  const [i, setI] = useState<LocalInspection | null | undefined>();
  const online = useOnline();
  const syncTimer = useRef<number>(undefined);
  useEffect(() => { void getInspection(id).then((x) => setI(x ?? null)); }, [id]);

  const update: Update = useCallback((fn) => {
    setI((prev) => {
      if (!prev) return prev;
      const next = { ...fn(prev), dirty: true };
      void saveInspection(next);
      window.clearTimeout(syncTimer.current);
      if (next.plateEntered.length >= 2) syncTimer.current = window.setTimeout(() => void syncInspection(id), 1500);
      return next;
    });
  }, [id]);
  const setForm: SetForm = (fn) => update((x) => ({ ...x, form: fn(x.form) }));
  const goStep = (step: number) => { update((x) => ({ ...x, step })); window.scrollTo(0, 0); };

  if (i === undefined) return <div className="p-4 text-muted">Loading…</div>;
  if (i === null) return <div className="space-y-3 p-4"><p>This inspection is no longer on this phone.</p><button type="button" className="btn btn-ghost" onClick={() => go({ name: 'home' })}>Back</button></div>;

  const f = i.form;
  const step = i.step;
  const canNext = [
    !!i.plateEntered,
    !!f.mileage && !!i.photos.odometer,
    (!i.newToSazo || !!f.identity?.chassisSeen) && (!f.identity?.chassisSeen || !!i.photos.chassis),
    true,
    !!f.structure && (!f.structure.damageFound || (f.structure.areas.length > 0 && !!f.structure.severity)),
    CAR_PHOTO_SLOTS.every(([slot, , required]) => !required || !!i.photos[slot]),
    true,
  ][step];
  const props = { i, update, setForm };

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col">
      <div className="px-4 pt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-label">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        <div className="mt-2 flex gap-1" aria-hidden>{STEPS.map((s, n) => <span key={s} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-primary-container' : 'bg-soft-3'}`} />)}</div>
      </div>
      <div className="flex-1 space-y-5 p-4">
        {step === 0 && <CarStep {...props} workplace={workplace} online={online} />}
        {step === 1 && <MileageStep {...props} />}
        {step === 2 && <IdentityStep {...props} />}
        {step === 3 && <PaintStep {...props} />}
        {step === 4 && <ConditionStep {...props} />}
        {step === 5 && <PhotosStep {...props} />}
        {step === 6 && <ResultStep {...props} workplace={workplace} me={me} online={online} goStep={goStep} />}
      </div>
      {step < 6 && (
        <div className="bottom-bar flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => (step === 0 ? go({ name: 'home' }) : goStep(step - 1))}><Icon name="arrow_back" />{step === 0 ? 'Home' : 'Back'}</button>
          <button type="button" className="btn btn-primary flex-1" disabled={!canNext} onClick={() => goStep(step + 1)}>Next<Icon name="arrow_forward" /></button>
        </div>
      )}
    </div>
  );
}

function Choice<T extends string | boolean>({ legend, options, value, onPick }: { legend: string; options: readonly (readonly [T, string])[]; value: T | undefined; onPick: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => <button key={String(v)} type="button" className="pill flex-1 justify-center" aria-pressed={value === v} onClick={() => onPick(v)}>{text}</button>)}
      </div>
    </fieldset>
  );
}

function CarStep({ i, update, workplace, online }: StepProps & { workplace: Garage; online: boolean }) {
  const [plate, setPlate] = useState(i.plateEntered);
  const [result, setResult] = useState<Lookup | 'offline' | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function find() {
    const p = plate.trim().toUpperCase();
    if (p.replace(/\s/g, '').length < 4) { setError('Enter the number plate, e.g. UBK 482M'); return; }
    setBusy(true); setError(undefined);
    try {
      const r = await request<Lookup>(`/inspections/vehicles/lookup?plate=${encodeURIComponent(p)}`, { org: workplace.id });
      setResult(r);
      if (r.outcome === 'not_found') update((x) => ({ ...x, plateEntered: p, vehicleRef: undefined, vehicleLabel: undefined, newToSazo: true }));
    } catch (err) {
      if (err instanceof OfflineError) {
        setResult('offline');
        update((x) => ({ ...x, plateEntered: p, vehicleRef: undefined, vehicleLabel: undefined, newToSazo: false }));
      } else setError(err instanceof ApiError && err.code === 'invalid_plate' ? 'That does not look like a number plate.' : 'Could not look up the car. Try again.');
    } finally { setBusy(false); }
  }
  const choose = (c: Candidate) => update((x) => ({ ...x, plateEntered: plate.trim().toUpperCase(), vehicleRef: c.vehicleRef, newToSazo: false,
    vehicleLabel: [c.year, c.make, c.model].filter(Boolean).join(' ') || 'Vehicle' }));

  return (
    <>
      <h1 className="font-display text-2xl font-bold">Which car are you inspecting?</h1>
      <div>
        <label htmlFor="plate" className="label">Number plate</label>
        <div className="flex gap-2">
          <input id="plate" className="field sazo-id !text-lg font-bold" autoCapitalize="characters" autoComplete="off" spellCheck={false}
            placeholder="UBK 482M" value={plate} onChange={(e) => { setPlate(e.target.value); setResult(undefined); }} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }} />
          <button type="button" className="btn btn-primary" onClick={() => void find()} disabled={busy}><Icon name="search" />{busy ? '…' : 'Find'}</button>
        </div>
        {error && <p role="alert" className="mt-1 text-sm font-semibold text-bad-text">{error}</p>}
      </div>
      {result === 'offline' && (
        <div className="rounded-lg border border-warn-line bg-warn-fill p-3 text-sm text-warn-text">
          <p className="font-semibold">No signal — carry on.</p>
          <p className="text-on-surface">SAZO will match the plate to the car when you send the inspection. Read the chassis number in the next steps.</p>
        </div>
      )}
      {result && result !== 'offline' && result.outcome === 'multiple' && (
        <div role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 text-sm text-bad-text">
          <p className="font-semibold">This plate is on {result.candidates.length} cars in SAZO.</p>
          <p className="text-on-surface">One may be using a copied plate. Compare the chassis number on the car and pick the right one.</p>
        </div>
      )}
      {result && result !== 'offline' && result.candidates.map((c) => (
        <div key={c.vehicleRef} className={`card p-4 ${i.vehicleRef === c.vehicleRef ? '!border-primary-container ring-2 ring-primary-container/20' : ''}`}>
          <p className="font-display text-lg font-bold">{[c.year, c.make, c.model].filter(Boolean).join(' ') || 'Vehicle'}</p>
          <dl className="mt-1 grid grid-cols-2 gap-2 text-sm">
            {c.colour && <div><dt className="text-label">Colour on record</dt><dd className="font-semibold capitalize">{c.colour}</dd></div>}
            {c.chassisLast4 && <div><dt className="text-label">Chassis ends in</dt><dd className="sazo-id font-bold">{c.chassisLast4}</dd></div>}
            {c.expectedEngineNumber && <div><dt className="text-label">Engine no. on record</dt><dd className="sazo-id font-semibold">{c.expectedEngineNumber}</dd></div>}
            {c.lastMileage && <div><dt className="text-label">Last mileage</dt><dd className="font-semibold">{formatKm(c.lastMileage.km)} · {formatDate(c.lastMileage.on)}</dd></div>}
          </dl>
          <button type="button" className={`btn mt-3 w-full ${i.vehicleRef === c.vehicleRef ? 'btn-ghost' : 'btn-primary'}`} aria-pressed={i.vehicleRef === c.vehicleRef} onClick={() => choose(c)}>
            {i.vehicleRef === c.vehicleRef ? <><Icon name="check_circle" />This is the car</> : 'Yes, this is the car'}
          </button>
        </div>
      ))}
      {((result && result !== 'offline' && result.outcome === 'not_found') || i.newToSazo) && (
        <div className="rounded-lg border border-line bg-soft p-3 text-sm">
          <p className="font-semibold">This car is new to SAZO.</p>
          <p>You will read its chassis number and photograph it in the Identity step.</p>
        </div>
      )}
      {!result && i.plateEntered && <p className="text-sm text-muted">Chosen: <PlateText value={i.plateEntered} /> {i.vehicleLabel ?? (i.newToSazo ? '(new to SAZO)' : '(will be matched when sent)')}</p>}
      {!online && !result && <p className="text-sm text-muted">No signal: type the plate and tap Find — you can carry on without the lookup.</p>}
    </>
  );
}

function MileageStep({ i, update, setForm }: StepProps) {
  const m = i.form.mileage;
  const [text, setText] = useState(m ? m.value.toLocaleString('en-UG') : '');
  const unit = m?.unit ?? 'km';
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Mileage on the dashboard</h1>
      <div>
        <label htmlFor="km" className="label">Odometer reading<span className="text-bad-text"> *</span></label>
        <div className="flex gap-2">
          <input id="km" className="field !text-2xl font-bold tabular-nums" inputMode="numeric" autoComplete="off" value={text} onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
            setText(digits ? Number(digits).toLocaleString('en-UG') : '');
            setForm((f) => { const { mileage: _old, ...rest } = f; return digits ? { ...rest, mileage: { value: Number(digits), unit } } : rest; });
          }} />
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-line" role="group" aria-label="Unit">
            {(['km', 'mi'] as const).map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} className={`min-w-14 px-3 font-bold ${unit === u ? 'bg-primary-container text-white' : 'bg-white'}`}
                onClick={() => setForm((f) => (f.mileage ? { ...f, mileage: { ...f.mileage, unit: u } } : f))}>{u}</button>
            ))}
          </div>
        </div>
      </div>
      <PhotoButton jobId={i.id} kind="odometer_photo" photoId={i.photos.odometer} label="Odometer photo" required hint="Fit the whole dashboard reading in the photo."
        onChange={(p) => update((x) => ({ ...x, photos: { ...x.photos, odometer: p } }))} />
    </>
  );
}

function IdentityStep({ i, update, setForm }: StepProps) {
  const id = i.form.identity ?? {};
  const set = (patch: Partial<NonNullable<InspectionForm['identity']>>) => setForm((f) => ({ ...f, identity: { ...(f.identity ?? {}), ...patch } }));
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Is it the right car?</h1>
      <p className="-mt-3 text-muted">Write what you see on the car, not what the papers say. Differences from SAZO’s records are findings.</p>
      <div><label htmlFor="chassis" className="label">Chassis number or VIN on the car{i.newToSazo && <span className="text-bad-text"> *</span>}</label>
        <input id="chassis" className="field sazo-id" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={id.chassisSeen ?? ''}
          onChange={(e) => set({ chassisSeen: e.target.value.toUpperCase().trim() || undefined })} />
        <p className="mt-1 text-sm text-muted">{i.newToSazo ? 'Needed: this car is new to SAZO.' : 'Optional, but it is the strongest check that this is the car on record.'}</p></div>
      {id.chassisSeen && (
        <PhotoButton jobId={i.id} kind="vehicle_photo" photoId={i.photos.chassis} label="Chassis number photo" required
          onChange={(p) => update((x) => ({ ...x, photos: { ...x.photos, chassis: p } }))} />
      )}
      <div><label htmlFor="colour" className="label">Colour</label>
        <input id="colour" className="field" autoComplete="off" value={id.colourSeen ?? ''} onChange={(e) => set({ colourSeen: e.target.value || undefined })} /></div>
      <div><label htmlFor="engine" className="label">Engine number</label>
        <input id="engine" className="field sazo-id" autoCapitalize="characters" autoComplete="off" value={id.engineNumberSeen ?? ''} onChange={(e) => set({ engineNumberSeen: e.target.value.toUpperCase() || undefined })} /></div>
    </>
  );
}

function PaintStep({ i, setForm }: StepProps) {
  const readings = i.form.paint?.readings ?? [];
  const valueOf = (p: Panel) => readings.find((r) => r.panel === p)?.microns;
  const setReading = (p: Panel, raw: string) => setForm((f) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    const rest = (f.paint?.readings ?? []).filter((r) => r.panel !== p);
    const next = digits ? [...rest, { panel: p, microns: Number(digits) }] : rest;
    const ordered = PANELS.flatMap((x) => next.filter((r) => r.panel === x));
    const { paint: _old, ...form } = f;
    return ordered.length ? { ...form, paint: { readings: ordered } } : form;
  });
  const thick = readings.filter((r) => r.microns > REPAINT_MICRONS).length;
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Paint thickness</h1>
      <p className="-mt-3 text-muted">Use the paint gauge on each steel panel, in microns. Factory paint is usually 80–180. Skip panels you could not measure.</p>
      <div className="card divide-y divide-line">
        {PANELS.map((p) => {
          const v = valueOf(p);
          const isThick = v !== undefined && v > REPAINT_MICRONS;
          return (
            <div key={p} className="flex items-center justify-between gap-3 p-3">
              <label htmlFor={`paint-${p}`} className="min-w-0">
                <span className="font-semibold">{PANEL_LABELS[p]}</span>
                {isThick && <span className="block text-sm font-semibold text-warn-text">Thick — likely repainted</span>}
              </label>
              <div className="flex items-center gap-1">
                <input id={`paint-${p}`} className={`field !w-24 text-right font-bold tabular-nums ${isThick ? '!border-warn-line' : ''}`} inputMode="numeric" autoComplete="off"
                  value={v ?? ''} onChange={(e) => setReading(p, e.target.value)} />
                <span className="text-sm text-label">µm</span>
              </div>
            </div>
          );
        })}
      </div>
      {thick > 0 && <p role="status" className="text-sm font-semibold text-warn-text">{thick} {thick === 1 ? 'panel looks' : 'panels look'} repainted. Note any damage in the next step.</p>}
    </>
  );
}

function ConditionStep({ i, setForm }: StepProps) {
  const f = i.form;
  const [defect, setDefect] = useState('');
  const [tyres, setTyres] = useState(f.tyres ? String(f.tyres.minTreadPercent) : '');
  const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Condition</h1>
      <section className="card space-y-3 p-4" aria-label="Structure">
        <Choice legend="Structural damage (chassis, pillars, floor)? *" options={[[false, 'None found'], [true, 'Yes, found']] as const} value={f.structure?.damageFound}
          onPick={(v) => setForm((x) => ({ ...x, structure: { areas: [], ...(x.structure ?? {}), damageFound: v } }))} />
        {f.structure?.damageFound && (
          <>
            <fieldset><legend className="label">Where? *</legend>
              <div className="flex flex-wrap gap-2">{STRUCTURE_AREAS.map((a) => (
                <button key={a} type="button" className="pill" aria-pressed={f.structure!.areas.includes(a)}
                  onClick={() => setForm((x) => ({ ...x, structure: { ...x.structure!, areas: flip(x.structure!.areas, a) } }))}>{STRUCTURE_LABELS[a]}</button>
              ))}</div>
            </fieldset>
            <Choice legend="How bad? *" options={[['minor', 'Minor'], ['moderate', 'Moderate'], ['severe', 'Severe']] as const} value={f.structure.severity}
              onPick={(v) => setForm((x) => ({ ...x, structure: { ...x.structure!, severity: v } }))} />
          </>
        )}
      </section>
      <section className="card space-y-3 p-4" aria-label="Tyres and battery">
        <div><label htmlFor="tyres" className="label">Tread left on the worst tyre (%)</label>
          <input id="tyres" className="field !w-28 font-bold tabular-nums" inputMode="numeric" value={tyres} onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
            const n = digits ? Math.min(100, Number(digits)) : undefined;
            setTyres(n === undefined ? '' : String(n));
            setForm((x) => { const { tyres: _t, ...rest } = x; return n === undefined ? rest : { ...rest, tyres: { minTreadPercent: n } }; });
          }} /></div>
        <Choice legend="Battery" options={[[true, 'OK'], [false, 'Needs attention']] as const} value={f.battery?.ok}
          onPick={(v) => setForm((x) => ({ ...x, battery: { ok: v } }))} />
      </section>
      <section className="card space-y-3 p-4" aria-label="Defects">
        <p className="label !mb-0">Defects found</p>
        {(f.defects ?? []).length > 0 && (
          <ul className="space-y-2">{(f.defects ?? []).map((d, n) => (
            <li key={`${d.item}-${n}`} className="flex items-center justify-between gap-2 rounded-lg bg-soft p-2">
              <span>{d.item} <span className={`chip ${d.severity === 'major' ? 'border-bad-line bg-bad-fill text-bad-text' : 'border-warn-line bg-warn-fill text-warn-text'}`}>{d.severity}</span></span>
              <button type="button" className="p-2 text-label" aria-label={`Remove ${d.item}`} onClick={() => setForm((x) => {
                const defects = (x.defects ?? []).filter((_, k) => k !== n); const { defects: _d, ...rest } = x; return defects.length ? { ...rest, defects } : rest;
              })}><Icon name="delete" /></button>
            </li>
          ))}</ul>
        )}
        <div><label htmlFor="defect" className="label">What is wrong?</label>
          <input id="defect" className="field" maxLength={80} placeholder="e.g. Front brake pads worn" value={defect} onChange={(e) => setDefect(e.target.value)} /></div>
        <div className="flex gap-2">
          {(['minor', 'major'] as const).map((sev) => (
            <button key={sev} type="button" className="btn btn-ghost flex-1 whitespace-nowrap !px-2" disabled={!defect.trim()}
              onClick={() => { setForm((x) => ({ ...x, defects: [...(x.defects ?? []), { item: defect.trim(), severity: sev }] })); setDefect(''); }}>
              Add as {sev}</button>
          ))}
        </div>
      </section>
    </>
  );
}

function PhotosStep({ i, update }: StepProps) {
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Photos of the car</h1>
      <p className="-mt-3 text-muted">Buyers never see these photos — SAZO keeps them as proof of what you saw.</p>
      {CAR_PHOTO_SLOTS.map(([slot, label, required]) => (
        <PhotoButton key={slot} jobId={i.id} kind="vehicle_photo" photoId={i.photos[slot]} label={label} required={required}
          onChange={(p) => update((x) => ({ ...x, photos: { ...x.photos, [slot]: p } }))} />
      ))}
    </>
  );
}

function ResultStep({ i, update, setForm, workplace, me, online, goStep }: StepProps & { workplace: Garage; me: Me; online: boolean; goStep: (n: number) => void }) {
  const [warnings, setWarnings] = useState<InspectionWarning[]>([]);
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<InspectionSubmitResult>();
  const f = i.form;
  const missing = inspectionErrors(asIfUploaded(i));
  const stepOf = (path: string) => (path.startsWith('form.mileage') ? 1 : path.startsWith('form.identity') ? 2 : path.startsWith('form.structure') ? 4 : path.startsWith('form.photoIds') ? 5 : 6);

  async function send() {
    setBusy(true); setError(undefined);
    try {
      const key = i.submitKey ?? uuidv7();
      if (!i.submitKey) update((x) => ({ ...x, submitKey: key }));
      await saveInspection({ ...i, submitKey: key, dirty: true });
      await inspectionForServer(i); // every photo uploaded first
      if ((await syncInspection(i.id)) === 'offline') throw new OfflineError();
      const acknowledgedWarnings = warnings.filter((w) => explain[w.code]?.trim()).map((w) => ({ code: w.code, explanation: explain[w.code]!.trim() }));
      const res = await request<InspectionSubmitResult>(`/inspections/${i.id}/submit`, { method: 'POST', org: workplace.id, headers: { 'Idempotency-Key': key }, body: { acknowledgedWarnings } });
      await forgetInspection(i.id);
      setDone(res);
    } catch (err) {
      if (err instanceof OfflineError) setError('No signal. The inspection is saved on this phone — send it when you have signal.');
      else if (err instanceof ApiError && (err.code === 'warnings_need_acknowledgement' || err.code === 'blocked')) {
        setWarnings(err.errors as InspectionWarning[]);
        setError(err.code === 'blocked' ? 'This inspection cannot be sent as it is.' : 'What you found differs from SAZO’s records. Check, then explain to continue.');
      } else if (err instanceof ApiError && err.code === 'chassis_required') { update((x) => ({ ...x, newToSazo: true })); setError('This car is new to SAZO: enter the chassis number and photograph it (Identity step).'); }
      else if (err instanceof ApiError) setError(err.detail ?? 'SAZO could not accept this inspection.');
      else setError('Something went wrong. The inspection is still saved on this phone.');
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <Icon name="check_circle" size={56} className="mx-auto text-ok-text" />
        <h1 className="font-display text-2xl font-bold">{done.status === 'accepted' ? 'Added to the car’s history' : done.status === 'submitted' ? 'Sent — SAZO is checking which car it is' : 'Not accepted'}</h1>
        {done.rejectionReason && <p className="text-bad-text">{done.rejectionReason}</p>}
        <p className="text-muted">SAZO keeps a signed copy of your checklist and photos.</p>
        <button type="button" className="btn btn-primary w-full" onClick={() => go({ name: 'home' })}>Done</button>
      </div>
    );
  }

  const thick = (f.paint?.readings ?? []).filter((r) => r.microns > REPAINT_MICRONS).length;
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Result and send</h1>
      <Choice legend="Did the car pass the inspection? *" options={[[true, 'Passed'], [false, 'Did not pass']] as const} value={f.result?.passed}
        onPick={(v) => setForm((x) => ({ ...x, result: { ...(x.result ?? {}), passed: v } }))} />
      <div><label htmlFor="summary" className="label">Summary for the record (optional)</label>
        <textarea id="summary" rows={3} maxLength={1000} className="field !min-h-24 py-3" value={f.result?.summary ?? ''}
          onChange={(e) => setForm((x) => (x.result ? { ...x, result: { ...x.result, summary: e.target.value || undefined } } : x))} disabled={!f.result} /></div>

      <div className="card divide-y divide-line">
        <Row label="Car" onEdit={() => goStep(0)}><PlateText value={i.plateEntered} /> <span className="text-sm">{i.vehicleLabel ?? (i.newToSazo ? 'New to SAZO' : 'Matched when sent')}</span></Row>
        <Row label="Mileage" onEdit={() => goStep(1)}>{f.mileage ? `${f.mileage.value.toLocaleString('en-UG')} ${f.mileage.unit}` : '—'}{i.photos.odometer ? ' · with photo' : ''}</Row>
        <Row label="Paint" onEdit={() => goStep(3)}>{f.paint?.readings.length ? `${f.paint.readings.length} panels measured${thick ? ` · ${thick} thick` : ''}` : 'Not measured'}</Row>
        <Row label="Condition" onEdit={() => goStep(4)}>{f.structure ? (f.structure.damageFound ? 'Structural damage found' : 'No structural damage') : '—'}{f.defects?.length ? ` · ${f.defects.length} defects` : ''}</Row>
        <Row label="Photos" onEdit={() => goStep(5)}>{CAR_PHOTO_SLOTS.filter(([s]) => i.photos[s]).length} of the car</Row>
        <Row label="Inspector">{me.displayName}</Row>
      </div>

      {missing.length > 0 && (
        <div role="alert" className="rounded-lg border border-warn-line bg-warn-fill p-3 text-warn-text">
          <p className="font-semibold">Still needed</p>
          <ul className="mt-1 space-y-1">{missing.map((m) => (
            <li key={m.path}><button type="button" className="text-left text-on-surface underline" onClick={() => goStep(stepOf(m.path))}>{m.message}</button></li>
          ))}</ul>
        </div>
      )}
      {warnings.map((w) => (
        <div key={w.code} className={`rounded-lg border p-3 ${w.severity === 'serious' ? 'border-bad-line bg-bad-fill' : 'border-warn-line bg-warn-fill'}`}>
          <p className={`flex gap-2 font-semibold ${w.severity === 'serious' ? 'text-bad-text' : 'text-warn-text'}`}><Icon name="warning" size={18} className="mt-0.5 shrink-0" />{w.message}</p>
          {!w.blocking && (
            <>
              <label htmlFor={`ex-${w.code}`} className="label mt-2">Explain what you checked</label>
              <textarea id={`ex-${w.code}`} rows={2} maxLength={500} className="field !min-h-20 py-3" value={explain[w.code] ?? ''} onChange={(e) => setExplain((x) => ({ ...x, [w.code]: e.target.value }))} />
            </>
          )}
        </div>
      ))}
      {error && <p role="alert" className="font-semibold text-bad-text">{error}</p>}
      <div className="bottom-bar -mx-4 flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => goStep(5)}><Icon name="arrow_back" />Back</button>
        <button type="button" className="btn btn-focal flex-1"
          disabled={busy || missing.length > 0 || !online || warnings.some((w) => w.blocking) || warnings.some((w) => (explain[w.code]?.trim().length ?? 0) < 3)}
          onClick={() => void send()}>
          <Icon name="cloud_upload" />{busy ? 'Sending…' : online ? 'Send to SAZO' : 'Send when online'}
        </button>
      </div>
    </>
  );
}

function Row({ label, children, onEdit }: { label: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-label">{label}</p><div className="mt-0.5">{children}</div></div>
      {onEdit && <button type="button" className="shrink-0 p-2 text-primary-container" aria-label={`Change ${label.toLowerCase()}`} onClick={onEdit}><Icon name="edit" /></button>}
    </div>
  );
}
