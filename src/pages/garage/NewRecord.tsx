import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { findVehicle, fmtKm, normalisePlate, workCatalogue, type Vehicle } from "../../data/mock";
import { useStore } from "../../store";

const RECORD_TYPES = ["Service", "Repair", "Accident repair", "Diagnostic"] as const;
type RecordType = (typeof RECORD_TYPES)[number];

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/jpeg", "image/png"];
const DRAFT_KEY = "sazo.garage.draft";

interface Upload {
  id: number;
  name: string;
  size: number;
  progress: number;
  error?: string;
}

interface Draft {
  plate: string;
  type: RecordType;
  odometer: string;
  date: string;
  work: string[];
  notes: string;
  cost: string;
  consent: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const blankDraft = (plate = "KDA 482Q"): Draft => ({
  plate,
  type: "Service",
  odometer: "",
  date: today(),
  work: [],
  notes: "",
  cost: "",
  consent: false,
});

function loadDraft(plateParam: string | null): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = { ...blankDraft(), ...(JSON.parse(raw) as Partial<Draft>) };
      return plateParam ? { ...d, plate: normalisePlate(plateParam) } : d;
    }
  } catch {
    /* storage unavailable — start fresh */
  }
  return blankDraft(plateParam ? normalisePlate(plateParam) : undefined);
}

const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function NewRecord() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { addRecord, online, toast } = useStore();
  const [draft, setDraft] = useState<Draft>(() => loadDraft(params.get("plate")));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [changingVehicle, setChangingVehicle] = useState(false);
  const [plateInput, setPlateInput] = useState("");
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [odoConfirmed, setOdoConfirmed] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const nextUpload = useRef(1);

  const vehicle: Vehicle | undefined = findVehicle(draft.plate);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Autosave the draft (debounced).
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setSavedAt(new Date());
      } catch {
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [draft]);

  const odo = Number(draft.odometer.replace(/[^0-9]/g, "")) || 0;
  const odoLow = !!vehicle && odo > 0 && odo < vehicle.lastOdometer;
  useEffect(() => setOdoConfirmed(false), [draft.odometer, draft.plate]);

  const evidenceDone = uploads.some((u) => u.progress >= 100 && !u.error);
  const uploading = uploads.some((u) => u.progress < 100 && !u.error);
  const workValid = odo > 0 && !!draft.date && draft.work.length > 0;
  const odoOk = !odoLow || odoConfirmed;
  const canSubmit = !!vehicle && workValid && odoOk && draft.consent && !uploading;

  const step = !vehicle ? 1 : !workValid ? 2 : !evidenceDone ? 3 : 4;
  const blockers = useMemo(() => {
    const b: string[] = [];
    if (!vehicle) b.push("choose a vehicle");
    if (odo <= 0) b.push("enter the odometer");
    if (draft.work.length === 0) b.push("add the work done");
    if (!draft.consent) b.push("confirm the customer has been told");
    if (uploading) b.push("wait for uploads to finish");
    return b;
  }, [vehicle, odo, draft.work.length, draft.consent, uploading]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const id = nextUpload.current++;
      const error = !ACCEPT.includes(f.type) ? "Use PDF, JPG or PNG" : f.size > MAX_BYTES ? "Larger than 20 MB" : undefined;
      setUploads((u) => [...u, { id, name: f.name, size: f.size, progress: 0, error }]);
      if (error) continue;
      // Simulated upload progress until the API exists.
      const timer = window.setInterval(() => {
        setUploads((us) =>
          us.map((u) => {
            if (u.id !== id) return u;
            const progress = Math.min(100, u.progress + 8 + Math.random() * 18);
            if (progress >= 100) window.clearInterval(timer);
            return { ...u, progress };
          }),
        );
      }, 180);
    }
  }

  function changeVehicle(e: React.FormEvent) {
    e.preventDefault();
    const v = findVehicle(plateInput);
    if (!v) return;
    set("plate", v.plate);
    setChangingVehicle(false);
    setPlateInput("");
  }

  function submit() {
    if (!canSubmit || !vehicle) return;
    const status = !online ? "queued" : evidenceDone ? "checking" : "needs-invoice";
    addRecord({
      plate: vehicle.plate,
      work: draft.work.join(", ") || draft.type,
      km: odo,
      by: "J. Mwangi",
      status,
      date: draft.date,
    });
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    toast(online ? `Record for ${vehicle.plate} submitted for checking` : `Saved on this device — ${vehicle.plate} will upload when you’re back online`);
    navigate("/garage");
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setSavedAt(new Date());
      toast("Draft saved");
    } catch {
      toast("Couldn’t save the draft on this device");
    }
  }

  const stepCls = (n: number) => (n <= step ? "step done" : "step");

  return (
    <div className="page record-page">
      <div className="record-card">
        <div className="record-head">
          <h1 style={{ fontWeight: 800, fontSize: 20 }}>New record</h1>
          <ol className="steps" aria-label="Progress">
            {["Vehicle", "Work", "Evidence", "Submit"].map((s, i) => (
              <li key={s} className={stepCls(i + 1)} aria-current={step === i + 1 ? "step" : undefined}>
                {i + 1} {s}
              </li>
            ))}
          </ol>
          <span style={{ fontSize: 13 }} className="tone-green" aria-live="polite">
            {savedAt ? `✓ Draft saved ${fmtTime(savedAt)}` : ""}
          </span>
        </div>

        <div className="record-grid">
          <div className="record-col">
            {/* Vehicle */}
            {changingVehicle ? (
              <form onSubmit={changeVehicle} className="field">
                <label className="label" htmlFor="plate">
                  Number plate
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input id="plate" className="input" autoFocus value={plateInput} onChange={(e) => setPlateInput(e.target.value)} placeholder="e.g. KDA 482Q" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }} />
                  <button className="btn btn-primary btn-xl" type="submit" disabled={!findVehicle(plateInput)}>
                    Use
                  </button>
                  <button className="btn btn-secondary btn-xl" type="button" onClick={() => setChangingVehicle(false)}>
                    Cancel
                  </button>
                </div>
                {plateInput.length >= 6 && !findVehicle(plateInput) && <p className="field-error">! We couldn’t find {normalisePlate(plateInput)}. Check the plate.</p>}
              </form>
            ) : (
              <div className="vehicle-bar">
                <span className="plate-tag">{draft.plate || "—"}</span>
                <span style={{ fontSize: 14 }}>{vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.year} · ${vehicle.colour}` : "Vehicle not found"}</span>
                <button className="link" style={{ marginLeft: "auto" }} onClick={() => setChangingVehicle(true)}>
                  Change
                </button>
              </div>
            )}

            {/* Record type */}
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>
                Record type
              </legend>
              <div className="type-grid" role="radiogroup">
                {RECORD_TYPES.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={draft.type === t} onClick={() => set("type", t)}>
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="odo">
                  Odometer (km) *
                </label>
                <input
                  id="odo"
                  className={`input big${odoLow && !odoConfirmed ? " error" : ""}`}
                  inputMode="numeric"
                  value={draft.odometer}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 7);
                    set("odometer", digits ? fmtKm(Number(digits)) : "");
                  }}
                  aria-invalid={odoLow && !odoConfirmed}
                  aria-describedby={odoLow ? "odo-err" : undefined}
                />
                {odoLow && vehicle && (
                  <>
                    <p className="field-error" id="odo-err">
                      ! Lower than the last reading ({fmtKm(vehicle.lastOdometer)} km,{" "}
                      {new Date(vehicle.lastOdometerDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}). Did you miss a digit?
                    </p>
                    <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "center" }}>
                      <input type="checkbox" checked={odoConfirmed} onChange={(e) => setOdoConfirmed(e.target.checked)} />
                      The reading is correct (e.g. replaced cluster)
                    </label>
                  </>
                )}
              </div>
              <div className="field">
                <label className="label" htmlFor="date">
                  Date of work *
                </label>
                <input id="date" type="date" className="input sunken" max={today()} value={draft.date} onChange={(e) => set("date", e.target.value)} />
              </div>
            </div>

            {/* Work done */}
            <div className="field">
              <span className="label" id="work-label">
                Work done
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, position: "relative" }} aria-labelledby="work-label">
                {draft.work.map((w) => (
                  <button key={w} type="button" className="work-chip" onClick={() => set("work", draft.work.filter((x) => x !== w))} aria-label={`Remove ${w}`}>
                    {w} ✕
                  </button>
                ))}
                <button type="button" className="work-add" aria-expanded={catalogueOpen} onClick={() => setCatalogueOpen((o) => !o)}>
                  + Add from catalogue
                </button>
                {catalogueOpen && (
                  <ul className="catalogue" role="listbox">
                    {workCatalogue
                      .filter((w) => !draft.work.includes(w))
                      .map((w) => (
                        <li key={w}>
                          <button
                            type="button"
                            onClick={() => {
                              set("work", [...draft.work, w]);
                              setCatalogueOpen(false);
                            }}
                          >
                            {w}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="notes">
                Notes for the record <span className="hint">(public)</span>
              </label>
              <textarea id="notes" className="input sunken" value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Pads at 2 mm, replaced with OEM. Discs within limits." />
            </div>
          </div>

          <div className="record-col side">
            <div className="field" style={{ gap: 8 }}>
              <span className="label">Evidence</span>
              <div
                className={`dropzone${dragging ? " over" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
              >
                <p style={{ fontWeight: 800 }}>Drop invoice or photos, or take a photo</p>
                <p style={{ fontSize: 13, color: "var(--ink-2)" }}>PDF, JPG, PNG up to 20 MB. Location data is removed automatically.</p>
                <input ref={fileInput} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png" capture="environment" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </div>
              {uploads.map((u) => (
                <div key={u.id} className="upload-row">
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                    {u.error ? (
                      <span style={{ marginLeft: "auto" }} className="tone-red-strong">
                        ! {u.error}
                      </span>
                    ) : u.progress >= 100 ? (
                      <>
                        <span className="muted">{fmtSize(u.size)}</span>
                        <span style={{ marginLeft: "auto", fontWeight: 600 }} className="tone-green">
                          ✓ Uploaded
                        </span>
                      </>
                    ) : (
                      <span style={{ marginLeft: "auto" }} className="muted">
                        {Math.round(u.progress)}%
                      </span>
                    )}
                    <button className="link" aria-label={`Remove ${u.name}`} onClick={() => setUploads((us) => us.filter((x) => x.id !== u.id))}>
                      ✕
                    </button>
                  </div>
                  {!u.error && u.progress < 100 && (
                    <div className="progress">
                      <div style={{ width: `${u.progress}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="field">
              <label className="label" htmlFor="cost">
                Parts &amp; labour cost <span className="hint">(private — never shown to buyers)</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>KSh</span>
                <input
                  id="cost"
                  className="input"
                  inputMode="numeric"
                  style={{ paddingLeft: 52 }}
                  value={draft.cost}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 9);
                    set("cost", digits ? fmtKm(Number(digits)) : "");
                  }}
                />
              </div>
            </div>

            <label className="consent">
              <input type="checkbox" checked={draft.consent} onChange={(e) => set("consent", e.target.checked)} />
              <span className="box" aria-hidden>
                {draft.consent ? "✓" : ""}
              </span>
              <span style={{ fontSize: 14 }}>The customer has been told this work will be recorded on SAZO. No personal details are shared.</span>
            </label>

            <div className="actions" style={{ marginTop: "auto" }}>
              <button type="button" className="btn btn-secondary btn-xl" onClick={saveDraft}>
                Save draft
              </button>
              <button type="button" className="btn btn-primary btn-xl" style={{ flex: 1 }} disabled={!canSubmit} onClick={submit}>
                {online ? "Submit record" : "Save to submit later"}
              </button>
            </div>
            <p className="small muted">
              {odoLow && !odoConfirmed
                ? "Submit is disabled until the odometer warning is resolved or confirmed."
                : blockers.length
                  ? `To submit: ${blockers.join(", ")}.`
                  : !evidenceDone
                    ? "No invoice attached — the record will show as “Needs invoice” until you add one."
                    : "Ready to submit."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
