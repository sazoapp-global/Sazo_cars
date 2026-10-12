import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { findVehicle, normalisePlate, type Vehicle } from "../../data/mock";

// P7 — scan plate. Uses the device camera when available. Plate recognition is
// stubbed until the OCR service exists: after a short delay it "reads" a sample plate.
export function ScanPlate() {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [found, setFound] = useState<Vehicle | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => {
        /* no camera or permission denied — the frame stays dark */
      });
    const t = window.setTimeout(() => setFound(findVehicle("KDA 482Q") ?? null), 1400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const typedVehicle = findVehicle(typed);
  const use = (v: Vehicle) => navigate(`/garage/records/new?plate=${encodeURIComponent(v.plate)}`);

  return (
    <div className="scan">
      <div className="scan-top">
        <Link to="/garage" style={{ color: "#fff", textDecoration: "none" }}>
          ✕ Cancel
        </Link>
        <span style={{ fontWeight: 800 }}>Scan plate</span>
        <span />
      </div>
      <div className="scan-view">
        <video ref={video} autoPlay playsInline muted className="scan-video" />
        <div className="scan-frame">
          {found ? <span className="scan-plate">{found.plate}</span> : <span style={{ fontSize: 13, color: "var(--blue-on-navy)" }}>Point at the number plate…</span>}
        </div>
      </div>
      <div className="scan-sheet">
        {typing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typedVehicle) use(typedVehicle);
            }}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            <label className="label" htmlFor="typed-plate">
              Number plate
            </label>
            <input id="typed-plate" className="input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} style={{ textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.08em" }} />
            {typed.length >= 6 && !typedVehicle && <p className="field-error">! We couldn’t find {normalisePlate(typed)}.</p>}
            {typedVehicle && <p style={{ fontWeight: 800, fontSize: 18 }}>{`${typedVehicle.plate} · ${typedVehicle.make} ${typedVehicle.model} · ${typedVehicle.colour}`}</p>}
            <button className="btn btn-primary btn-xl" disabled={!typedVehicle}>
              Use this vehicle
            </button>
            <button type="button" className="btn btn-secondary btn-xl" onClick={() => setTyping(false)}>
              Back to camera
            </button>
          </form>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--ink-2)" }}>{found ? "Found" : "Looking for a plate…"}</p>
            <p style={{ fontWeight: 800, fontSize: 18, minHeight: 28 }}>{found ? `${found.plate} · ${found.make} ${found.model} · ${found.colour}` : ""}</p>
            <button className="btn btn-primary btn-xl" disabled={!found} onClick={() => found && use(found)}>
              Use this vehicle
            </button>
            <button className="btn btn-secondary btn-xl" onClick={() => setTyping(true)}>
              Type plate instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}
