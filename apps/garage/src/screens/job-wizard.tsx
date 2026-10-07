// A garage job in short steps (D-052): only the questions for the work chosen. Every change is saved on the
// phone at once and sent to SAZO when there's signal (offline-first). Submitting needs signal.
import { WORK_LABELS, WORK_TYPES, completenessErrors, formatDate, formatKm, type JobForm, type WorkType } from '@sazo/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Garage } from '../lib/types';
import { PlateText } from '../components/bits';
import { Icon, type IconName } from '../components/icon';
import { PhotoButton } from '../components/photo-button';
import { ApiError, OfflineError, request } from '../lib/api';
import { forgetJob, getDraft, saveDraft, type LocalDraft } from '../lib/db';
import { go, useOnline } from '../lib/route';
import { formForServer, syncDraft } from '../lib/sync';
import type { Candidate, CheckWarning, Lookup, Me, SubmitResult } from '../lib/types';
import { uuidv7 } from '../lib/uuid';

const STEPS = ['Car', 'Work', 'Mileage', 'Details', 'Customer', 'Check & send'] as const;
const WORK_ICONS: Record<WorkType, IconName> = {
  service: 'build', repair: 'engineering', accident_damage: 'car_crash', body_paint: 'format_paint', engine: 'settings',
  transmission: 'settings', electrical: 'electric_bolt', inspection: 'list_alt', other: 'build',
};
const SERVICE_ITEMS = ['Engine oil', 'Oil filter', 'Air filter', 'Fuel filter', 'Spark plugs', 'Brake pads', 'Brake fluid', 'Coolant', 'Gearbox oil', 'Wheel alignment', 'Tyre rotation', 'Battery'];
const COMPONENTS = ['Suspension', 'Brakes', 'Bumper', 'Bonnet', 'Door', 'Radiator', 'Lights', 'Exhaust', 'Clutch', 'Steering', 'Windscreen', 'Wiring'];
const AREAS = [['full_body', 'Whole car'], ['front', 'Front'], ['rear', 'Rear'], ['left', 'Left side'], ['right', 'Right side'], ['roof', 'Roof'], ['bonnet', 'Bonnet'], ['other', 'Other']] as const;
const needsDetails = (w: WorkType[]) => w.some((t) => ['service', 'engine', 'body_paint', 'repair', 'accident_damage'].includes(t));

const toE164 = (input: string) => {
  const d = input.replace(/[\s\-().]/g, '');
  const e = d.startsWith('+') ? d : d.startsWith('256') ? `+${d}` : d.startsWith('0') ? `+256${d.slice(1)}` : /^7\d{8}$/.test(d) ? `+256${d}` : '';
  return /^\+[1-9]\d{7,14}$/.test(e) ? e : undefined;
};
const kmOf = (m?: JobForm['mileage']) => (m ? (m.unit === 'mi' ? Math.round(m.value * 1.609344) : m.value) : undefined);

export function JobWizard({ jobId, garage, me }: { jobId: string; garage: Garage; me: Me }) {
  const [d, setD] = useState<LocalDraft | null | undefined>();
  const online = useOnline();
  const syncTimer = useRef<number>(undefined);

  useEffect(() => { void getDraft(jobId).then((x) => setD(x ?? null)); }, [jobId]);

  /** Save on the phone immediately; send to SAZO shortly after (if there's signal). */
  const update = useCallback((fn: (x: LocalDraft) => LocalDraft) => {
    setD((prev) => {
      if (!prev) return prev;
      const next = { ...fn(prev), dirty: true };
      void saveDraft(next);
      window.clearTimeout(syncTimer.current);
      if (next.plateEntered.length >= 2 && next.workTypes.length) syncTimer.current = window.setTimeout(() => void syncDraft(jobId), 1500);
      return next;
    });
  }, [jobId]);
  const setForm = (fn: (f: JobForm) => JobForm) => update((x) => ({ ...x, form: fn(x.form) }));
  const goStep = (step: number) => { update((x) => ({ ...x, step })); window.scrollTo(0, 0); };

  if (d === undefined) return <div className="p-4 text-muted">Loading…</div>;
  if (d === null) return <div className="space-y-3 p-4"><p>This job is no longer on this phone.</p><button type="button" className="btn btn-ghost" onClick={() => go({ name: 'home' })}>Back</button></div>;

  const step = d.step;
  const details = needsDetails(d.workTypes);
  const canNext = [
    !!d.plateEntered && (!d.newToSazo || !!d.photos.plate),
    d.workTypes.length > 0,
    !!d.form.mileage && !!d.photos.odometer,
    true, true, true,
  ][step];
  const next = () => goStep(step === 2 && !details ? 4 : step + 1);
  const back = () => (step === 0 ? go({ name: 'home' }) : goStep(step === 4 && !details ? 2 : step - 1));

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col">
      <div className="px-4 pt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-label">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        <div className="mt-2 flex gap-1" aria-hidden>{STEPS.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary-container' : 'bg-soft-3'}`} />)}</div>
      </div>
      <div className="flex-1 space-y-5 p-4">
        {step === 0 && <CarStep d={d} garage={garage} online={online} update={update} />}
        {step === 1 && <WorkStep d={d} update={update} />}
        {step === 2 && <MileageStep d={d} setForm={setForm} update={update} />}
        {step === 3 && <DetailsStep d={d} setForm={setForm} update={update} />}
        {step === 4 && <CustomerStep d={d} setForm={setForm} update={update} />}
        {step === 5 && <ReviewStep d={d} garage={garage} me={me} online={online} update={update} goStep={goStep} />}
      </div>
      {step < 5 && (
        <div className="bottom-bar flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={back}><Icon name="arrow_back" />{step === 0 ? 'Home' : 'Back'}</button>
          <button type="button" className="btn btn-primary flex-1" disabled={!canNext} onClick={next}>Next<Icon name="arrow_forward" /></button>
        </div>
      )}
    </div>
  );
}

type StepProps = { d: LocalDraft; update: (fn: (x: LocalDraft) => LocalDraft) => void };
type FormProps = StepProps & { setForm: (fn: (f: JobForm) => JobForm) => void };

function CarStep({ d, garage, online, update }: StepProps & { garage: Garage; online: boolean }) {
  const [plate, setPlate] = useState(d.plateEntered);
  const [result, setResult] = useState<Lookup | 'offline' | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function find() {
    const p = plate.trim().toUpperCase();
    if (p.replace(/\s/g, '').length < 4) { setError('Enter the number plate, e.g. UBK 482M'); return; }
    setBusy(true); setError(undefined);
    try {
      const r = await request<Lookup>(`/garage/vehicles/lookup?plate=${encodeURIComponent(p)}`, { org: garage.id });
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
      <h1 className="font-display text-2xl font-bold">Which car is in the bay?</h1>
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
          <p className="text-on-surface">SAZO will match the plate to the car when you send the job. Check the plate carefully.</p>
        </div>
      )}
      {result && result !== 'offline' && result.outcome === 'multiple' && (
        <div role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 text-sm text-bad-text">
          <p className="font-semibold">This plate is on {result.candidates.length} cars in SAZO.</p>
          <p className="text-on-surface">One may be using a copied plate. Check the chassis number on the car and pick the right one.</p>
        </div>
      )}
      {result && result !== 'offline' && result.candidates.map((c) => (
        <div key={c.vehicleRef} className={`card p-4 ${d.vehicleRef === c.vehicleRef ? '!border-primary-container ring-2 ring-primary-container/20' : ''}`}>
          <p className="font-display text-lg font-bold">{[c.year, c.make, c.model].filter(Boolean).join(' ') || 'Vehicle'}</p>
          <dl className="mt-1 grid grid-cols-2 gap-2 text-sm">
            {c.colour && <div><dt className="text-label">Colour</dt><dd className="font-semibold capitalize">{c.colour}</dd></div>}
            {c.chassisLast4 && <div><dt className="text-label">Chassis ends in</dt><dd className="sazo-id font-bold">{c.chassisLast4}</dd></div>}
            {c.expectedEngineNumber && <div><dt className="text-label">Engine no. on record</dt><dd className="sazo-id font-semibold">{c.expectedEngineNumber}</dd></div>}
            {c.lastMileage && <div><dt className="text-label">Last mileage</dt><dd className="font-semibold">{formatKm(c.lastMileage.km)} · {formatDate(c.lastMileage.on)}</dd></div>}
          </dl>
          <p className="mt-2 text-sm text-muted">Check the chassis plate on the car before you continue.</p>
          <button type="button" className={`btn mt-3 w-full ${d.vehicleRef === c.vehicleRef ? 'btn-ghost' : 'btn-primary'}`} aria-pressed={d.vehicleRef === c.vehicleRef} onClick={() => choose(c)}>
            {d.vehicleRef === c.vehicleRef ? <><Icon name="check_circle" />This is the car</> : 'Yes, this is the car'}
          </button>
        </div>
      ))}
      {((result && result !== 'offline' && result.outcome === 'not_found') || d.newToSazo) && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-soft p-3 text-sm">
            <p className="font-semibold">This car is new to SAZO.</p>
            <p>Take a photo of its number plate. The car will show as “not yet confirmed” until an official record matches it.</p>
          </div>
          <PhotoButton jobId={d.jobId} kind="plate_photo" photoId={d.photos.plate} label="Number plate photo" required
            onChange={(id) => update((x) => ({ ...x, photos: { ...x.photos, plate: id } }))} />
        </div>
      )}
      {!result && d.plateEntered && (
        <p className="text-sm text-muted">Chosen: <PlateText value={d.plateEntered} /> {d.vehicleLabel ?? (d.newToSazo ? '(new to SAZO)' : '(will be matched when sent)')}</p>
      )}
      {!online && !result && <p className="text-sm text-muted">No signal: type the plate and tap Find — you can carry on without the lookup.</p>}
    </>
  );
}

function WorkStep({ d, update }: StepProps) {
  const toggle = (w: WorkType) => update((x) => ({ ...x, workTypes: x.workTypes.includes(w) ? x.workTypes.filter((y) => y !== w) : [...x.workTypes, w] }));
  return (
    <>
      <h1 className="font-display text-2xl font-bold">What work was done?</h1>
      <p className="-mt-3 text-muted">Pick all that apply.</p>
      <div className="grid grid-cols-2 gap-2">
        {WORK_TYPES.map((w) => (
          <button key={w} type="button" className="tile" aria-pressed={d.workTypes.includes(w)} onClick={() => toggle(w)}>
            <Icon name={WORK_ICONS[w]} size={26} />{WORK_LABELS[w]}
          </button>
        ))}
      </div>
    </>
  );
}

function MileageStep({ d, setForm, update }: FormProps) {
  const m = d.form.mileage;
  const [text, setText] = useState(m ? m.value.toLocaleString('en-UG') : '');
  const unit = m?.unit ?? 'km';
  const setValue = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 7);
    setText(digits ? Number(digits).toLocaleString('en-UG') : '');
    setForm((f) => {
      const { mileage: _old, ...rest } = f;
      return digits ? { ...rest, mileage: { value: Number(digits), unit } } : rest;
    });
  };
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Mileage on the dashboard</h1>
      <div>
        <label htmlFor="km" className="label">Odometer reading<span className="text-bad-text"> *</span></label>
        <div className="flex gap-2">
          <input id="km" className="field !text-2xl font-bold tabular-nums" inputMode="numeric" autoComplete="off" value={text} onChange={(e) => setValue(e.target.value)} />
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-line" role="group" aria-label="Unit">
            {(['km', 'mi'] as const).map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} className={`min-w-14 px-3 font-bold ${unit === u ? 'bg-primary-container text-white' : 'bg-white'}`}
                onClick={() => setForm((f) => (f.mileage ? { ...f, mileage: { ...f.mileage, unit: u } } : f))}>{u}</button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">{unit === 'mi' ? 'Miles are converted to km for the record.' : 'Type the number exactly as shown.'}</p>
      </div>
      <PhotoButton jobId={d.jobId} kind="odometer_photo" photoId={d.photos.odometer} label="Odometer photo" required hint="Fit the whole dashboard reading in the photo."
        onChange={(id) => update((x) => ({ ...x, photos: { ...x.photos, odometer: id } }))} />
    </>
  );
}

function Pills({ options, selected, onToggle, label }: { options: readonly (readonly [string, string])[] | string[]; selected: string[]; onToggle: (v: string) => void; label: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const [value, text] = typeof o === 'string' ? [o, o] : o;
          return <button key={value} type="button" className="pill" aria-pressed={selected.includes(value)} onClick={() => onToggle(value)}>{text}</button>;
        })}
      </div>
    </fieldset>
  );
}
const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function DetailsStep({ d, setForm, update }: FormProps) {
  const f = d.form;
  const w = d.workTypes;
  const [extra, setExtra] = useState('');
  return (
    <>
      <h1 className="font-display text-2xl font-bold">About the work</h1>
      {w.includes('service') && (
        <section className="card space-y-3 p-4" aria-label="Service">
          <Pills label="What was done in the service?" options={SERVICE_ITEMS} selected={f.service?.items ?? []}
            onToggle={(v) => setForm((x) => { const items = flip(x.service?.items ?? [], v); const { service: _s, ...rest } = x; return items.length ? { ...rest, service: { items } } : rest; })} />
          <div className="flex gap-2">
            <input aria-label="Something else" className="field" placeholder="Something else…" value={extra} onChange={(e) => setExtra(e.target.value)} />
            <button type="button" className="btn btn-ghost" disabled={!extra.trim()} onClick={() => { setForm((x) => ({ ...x, service: { items: [...(x.service?.items ?? []), extra.trim()] } })); setExtra(''); }}>Add</button>
          </div>
        </section>
      )}
      {w.includes('engine') && (
        <section className="card space-y-3 p-4" aria-label="Engine">
          <fieldset><legend className="label">Was the engine replaced?</legend>
            <div className="flex gap-2">{[true, false].map((v) => (
              <button key={String(v)} type="button" className="pill flex-1 justify-center" aria-pressed={f.engine?.replaced === v} onClick={() => setForm((x) => ({ ...x, engine: { ...(x.engine ?? {}), replaced: v } }))}>{v ? 'Yes' : 'No, other engine work'}</button>
            ))}</div>
          </fieldset>
          {f.engine?.replaced && (
            <>
              <div><label htmlFor="old-eng" className="label">Old engine number</label>
                <input id="old-eng" className="field sazo-id" autoCapitalize="characters" value={f.engine.oldEngineNumber ?? ''} onChange={(e) => setForm((x) => ({ ...x, engine: { ...x.engine!, oldEngineNumber: e.target.value.toUpperCase() || undefined } }))} /></div>
              <div><label htmlFor="new-eng" className="label">New engine number<span className="text-bad-text"> *</span></label>
                <input id="new-eng" className="field sazo-id" autoCapitalize="characters" value={f.engine.newEngineNumber ?? ''} onChange={(e) => setForm((x) => ({ ...x, engine: { ...x.engine!, newEngineNumber: e.target.value.toUpperCase() || undefined } }))} /></div>
              <PhotoButton jobId={d.jobId} kind="engine_number_photo" photoId={d.photos.engine} label="New engine number photo" required
                onChange={(id) => update((x) => ({ ...x, photos: { ...x.photos, engine: id } }))} />
              <Pills label="Where is the new engine from?" options={[['new', 'New'], ['used_import', 'Used, imported'], ['used_local', 'Used, local'], ['rebuilt', 'Rebuilt']] as const}
                selected={f.engine.engineSource ? [f.engine.engineSource] : []} onToggle={(v) => setForm((x) => ({ ...x, engine: { ...x.engine!, engineSource: v as 'new' } }))} />
            </>
          )}
        </section>
      )}
      {w.includes('body_paint') && (
        <section className="card space-y-3 p-4" aria-label="Paint">
          <Pills label="Which parts were painted?" options={AREAS} selected={f.bodyPaint?.areas ?? []}
            onToggle={(v) => setForm((x) => ({ ...x, bodyPaint: { ...(x.bodyPaint ?? {}), areas: flip(x.bodyPaint?.areas ?? [], v) as never } }))} />
          <Pills label="Why?" options={[['accident', 'Accident'], ['cosmetic', 'Looks'], ['rust', 'Rust'], ['other', 'Other']] as const}
            selected={f.bodyPaint?.reason ? [f.bodyPaint.reason] : []} onToggle={(v) => setForm((x) => ({ ...x, bodyPaint: { areas: x.bodyPaint?.areas ?? [], ...x.bodyPaint, reason: v as 'accident' } }))} />
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="old-col" className="label">Old colour</label><input id="old-col" className="field" value={f.bodyPaint?.oldColour ?? ''} onChange={(e) => setForm((x) => ({ ...x, bodyPaint: { areas: x.bodyPaint?.areas ?? [], ...x.bodyPaint, oldColour: e.target.value || undefined } }))} /></div>
            <div><label htmlFor="new-col" className="label">New colour</label><input id="new-col" className="field" value={f.bodyPaint?.newColour ?? ''} onChange={(e) => setForm((x) => ({ ...x, bodyPaint: { areas: x.bodyPaint?.areas ?? [], ...x.bodyPaint, newColour: e.target.value || undefined } }))} /></div>
          </div>
        </section>
      )}
      {(w.includes('repair') || w.includes('accident_damage')) && (
        <section className="card space-y-3 p-4" aria-label="Repair">
          <Pills label="Which parts were repaired?" options={COMPONENTS} selected={f.repair?.components ?? []}
            onToggle={(v) => setForm((x) => ({ ...x, repair: { ...(x.repair ?? {}), components: flip(x.repair?.components ?? [], v) } }))} />
          <fieldset><legend className="label">Was the frame or chassis (structure) repaired?</legend>
            <div className="flex gap-2">{[true, false].map((v) => (
              <button key={String(v)} type="button" className="pill flex-1 justify-center" aria-pressed={f.repair?.structural === v} onClick={() => setForm((x) => ({ ...x, repair: { components: x.repair?.components ?? [], ...x.repair, structural: v } }))}>{v ? 'Yes' : 'No'}</button>
            ))}</div>
          </fieldset>
          <div><label htmlFor="desc" className="label">Notes (optional)</label>
            <textarea id="desc" rows={2} className="field !min-h-20 py-3" maxLength={2000} value={f.repair?.description ?? ''} onChange={(e) => setForm((x) => ({ ...x, repair: { components: x.repair?.components ?? [], ...x.repair, description: e.target.value || undefined } }))} /></div>
        </section>
      )}
    </>
  );
}

function CustomerStep({ d, setForm, update }: FormProps) {
  const c = d.form.customer;
  const [phoneText, setPhoneText] = useState(c?.phone ?? '');
  const [amountText, setAmountText] = useState(d.form.cost ? d.form.cost.total.amount.toLocaleString('en-UG') : '');
  const phoneValid = !phoneText || !!toE164(phoneText);
  const setCustomer = (patch: Partial<NonNullable<JobForm['customer']>>) => setForm((x) => ({ ...x, customer: { ...(x.customer ?? {}), ...patch } }));
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Customer and cost</h1>
      <section className="card space-y-3 p-4" aria-label="Customer">
        <div><label htmlFor="cname" className="label">Customer name</label>
          <input id="cname" className="field" autoComplete="off" value={c?.name ?? ''} onChange={(e) => setCustomer({ name: e.target.value || undefined })} /></div>
        <div><label htmlFor="cphone" className="label">Customer phone</label>
          <input id="cphone" className="field" type="tel" inputMode="tel" autoComplete="off" placeholder="0772 123 456" value={phoneText} aria-invalid={!phoneValid}
            onChange={(e) => { setPhoneText(e.target.value); setCustomer({ phone: toE164(e.target.value) }); }} />
          {!phoneValid && <p role="alert" className="mt-1 text-sm font-semibold text-bad-text">Check the number — e.g. 0772 123 456.</p>}
          <p className="mt-1 text-sm text-muted">Optional. With a number, the customer can confirm the visit by SMS — that makes your record count for more.</p></div>
        {c?.phone && (
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-[#0033aa]" checked={!!c.smsConsent} onChange={(e) => setCustomer({ smsConsent: e.target.checked })} />
            <span>The customer agreed to get one SMS from SAZO asking them to confirm this visit.</span>
          </label>
        )}
      </section>
      <section className="card space-y-3 p-4" aria-label="Cost">
        <div><label htmlFor="amount" className="label">Total charged</label>
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-label">UGX</span>
            <input id="amount" className="field !pl-14 font-semibold tabular-nums" inputMode="numeric" value={amountText} onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
              setAmountText(digits ? Number(digits).toLocaleString('en-UG') : '');
              setForm((x) => { const { cost: old, ...rest } = x; return digits ? { ...rest, cost: { ...(old ?? {}), total: { amount: Number(digits), currency: 'UGX' } } } : rest; });
            }} /></div>
          <p className="mt-1 text-sm text-muted">Never shown to buyers.</p></div>
        {d.form.cost && (
          <>
            <Pills label="Paid by" options={[['cash', 'Cash'], ['mtn_momo', 'MTN MoMo'], ['airtel_money', 'Airtel Money'], ['bank', 'Bank'], ['other', 'Other']] as const}
              selected={d.form.cost.method ? [d.form.cost.method] : []} onToggle={(v) => setForm((x) => ({ ...x, cost: { ...x.cost!, method: v as 'cash' } }))} />
            <PhotoButton jobId={d.jobId} kind="receipt" photoId={d.photos.receipt} label="Receipt photo (optional)"
              onChange={(id) => update((x) => ({ ...x, photos: { ...x.photos, receipt: id } }))} />
          </>
        )}
      </section>
    </>
  );
}

const WARNING_TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  'garage.check.mileage_lower_than_last': (p) => `The reading (${formatKm(p.enteredKm)}) is lower than the last one SAZO has: ${formatKm(p.lastKm)} on ${formatDate(String(p.lastOn))}. Check the dashboard, or explain (e.g. the instrument cluster was replaced).`,
  'garage.check.plate_on_several_vehicles': () => 'This plate is on more than one car in SAZO. Check the chassis number on the car.',
  'garage.check.implausible_mileage_rate': (p) => `That is about ${formatKm(p.kmPerYear)} a year — more than usual. Check the reading.`,
  'garage.check.old_engine_differs_from_record': (p) => `The old engine number you entered (${String(p.entered)}) is different from the record (${String(p.expected)}).`,
  'garage.check.date_in_future': () => "The job's date is in the future. Check the phone's date and time.",
};

function ReviewStep({ d, garage, me, online, update, goStep }: StepProps & { garage: Garage; me: Me; online: boolean; goStep: (n: number) => void }) {
  const [warnings, setWarnings] = useState<CheckWarning[]>([]);
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<SubmitResult>();

  // What's still missing, by the same rules the server uses. Photos count once taken on the phone.
  const asIfUploaded: JobForm = {
    ...d.form,
    ...(d.form.mileage ? { mileage: { ...d.form.mileage, ...(d.photos.odometer ? { odometerPhotoId: '00000000-0000-7000-8000-000000000000' } : {}) } } : {}),
    ...(d.form.engine ? { engine: { ...d.form.engine, ...(d.photos.engine ? { newEngineNumberPhotoId: '00000000-0000-7000-8000-000000000000' } : {}) } } : {}),
  };
  const missing = completenessErrors(d.workTypes, asIfUploaded);
  const stepOf = (path: string) => (path.startsWith('form.mileage') ? 2 : 3);
  const willSms = !!d.form.customer?.phone && !!d.form.customer.smsConsent;

  async function submit() {
    setBusy(true); setError(undefined);
    try {
      const key = d.submitKey ?? uuidv7();
      if (!d.submitKey) update((x) => ({ ...x, submitKey: key }));
      await saveDraft({ ...d, submitKey: key, dirty: true });
      await formForServer(d); // make sure every photo is uploaded first
      const synced = await syncDraft(d.jobId);
      if (synced === 'offline') throw new OfflineError();
      const acknowledgedWarnings = warnings.filter((w) => explain[w.code]?.trim()).map((w) => ({ code: w.code, explanation: explain[w.code]!.trim() }));
      const res = await request<SubmitResult>(`/garage/jobs/${d.jobId}/submit`, { method: 'POST', org: garage.id, headers: { 'Idempotency-Key': key }, body: { acknowledgedWarnings } });
      await forgetJob(d.jobId);
      setDone(res);
    } catch (err) {
      if (err instanceof OfflineError) setError('No signal. The job is saved on this phone — send it when you have signal.');
      else if (err instanceof ApiError && (err.code === 'warnings_need_acknowledgement' || err.code === 'blocked')) {
        setWarnings(err.errors as CheckWarning[]);
        setError(err.code === 'blocked' ? 'This job cannot be sent as it is.' : 'Please check these, then explain to continue.');
      } else if (err instanceof ApiError && err.code === 'plate_photo_required') { update((x) => ({ ...x, newToSazo: true })); setError('This car is new to SAZO: take a photo of its number plate (step 1).'); }
      else if (err instanceof ApiError) setError(err.detail ?? 'SAZO could not accept this job.');
      else setError('Something went wrong. The job is still saved on this phone.');
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <Icon name="check_circle" size={56} className="mx-auto text-ok-text" />
        <h1 className="font-display text-2xl font-bold">{done.jobStatus === 'accepted' ? 'Added to the car’s history' : done.jobStatus === 'submitted' ? 'Sent — SAZO is checking which car it is' : 'Not accepted'}</h1>
        {done.rejectionReason && <p className="text-bad-text">{done.rejectionReason}</p>}
        <p className="text-muted">{done.ownerConfirmation === 'pending' ? 'The customer will get an SMS to confirm the visit.' : 'No SMS was sent to the customer.'}</p>
        <button type="button" className="btn btn-primary w-full" onClick={() => go({ name: 'home' })}>Done</button>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold">Check and send</h1>
      <div className="card divide-y divide-line">
        <Row label="Car" onEdit={() => goStep(0)}><PlateText value={d.plateEntered} /> <span className="text-sm">{d.vehicleLabel ?? (d.newToSazo ? 'New to SAZO' : 'Matched when sent')}</span></Row>
        <Row label="Work" onEdit={() => goStep(1)}>{d.workTypes.map((w) => WORK_LABELS[w]).join(', ')}</Row>
        <Row label="Mileage" onEdit={() => goStep(2)}>{d.form.mileage ? `${d.form.mileage.value.toLocaleString('en-UG')} ${d.form.mileage.unit}${d.form.mileage.unit === 'mi' ? ` (${formatKm(kmOf(d.form.mileage))})` : ''}` : '—'}{d.photos.odometer ? ' · with photo' : ''}</Row>
        <Row label="Customer" onEdit={() => goStep(4)}>{d.form.customer?.name ?? 'Not given'}{willSms ? ' · will get an SMS' : ''}</Row>
        <Row label="Recorded by">{me.displayName}</Row>
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
          <p className={`flex gap-2 font-semibold ${w.severity === 'serious' ? 'text-bad-text' : 'text-warn-text'}`}><Icon name="warning" size={18} className="mt-0.5 shrink-0" />{WARNING_TEXT[w.messageKey]?.(w.params) ?? 'Please check this job.'}</p>
          {!w.blocking && (
            <>
              <label htmlFor={`ex-${w.code}`} className="label mt-2">Explain why it is correct</label>
              <textarea id={`ex-${w.code}`} rows={2} maxLength={500} className="field !min-h-20 py-3" value={explain[w.code] ?? ''} onChange={(e) => setExplain((x) => ({ ...x, [w.code]: e.target.value }))} />
            </>
          )}
        </div>
      ))}

      {error && <p role="alert" className="font-semibold text-bad-text">{error}</p>}
      <div className="bottom-bar -mx-4 flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => goStep(4)}><Icon name="arrow_back" />Back</button>
        <button type="button" className="btn btn-focal flex-1" disabled={busy || missing.length > 0 || !online || warnings.some((w) => w.blocking) || warnings.some((w) => !explain[w.code]?.trim() || explain[w.code]!.trim().length < 3)}
          onClick={() => void submit()}>
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
