import { useMemo, useState } from "react";
import { fmtKm, queueCounts, reviewQueue, type QueueCategory, type QueueItem } from "../../data/mock";
import { useStore } from "../../store";

type Filter = "all" | QueueCategory;
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["mileage", "Mileage"],
  ["dispute", "Disputes"],
  ["partner", "Partners"],
  ["anomaly", "Anomalies"],
];
const severityRank = { high: 0, medium: 1, info: 2 } as const;
const kickerTone = { high: "tone-red", medium: "tone-amber", info: "tone-blue" } as const;

type Decision = "request" | "correct" | "uphold" | "reject";
const decisionText: Record<Decision, string> = {
  request: "Information requested from",
  correct: "Record corrected — notified",
  uphold: "Finding upheld — notified",
  reject: "Record rejected — notified",
};

export function ReviewQueue() {
  const { toast } = useStore();
  const [items, setItems] = useState<QueueItem[]>(reviewQueue);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState(reviewQueue[0].id);
  const [resolved, setResolved] = useState(0);

  // Sorted by risk, then age (seed order is already oldest-first within a level).
  const visible = useMemo(
    () => items.filter((i) => filter === "all" || i.category === filter).sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [items, filter],
  );
  const selected = items.find((i) => i.id === selectedId) ?? visible[0];

  function decide(item: QueueItem, d: Decision) {
    const rest = visible.filter((i) => i.id !== item.id);
    setItems((is) => is.filter((i) => i.id !== item.id));
    setResolved((r) => r + 1);
    if (rest[0]) setSelectedId(rest[0].id);
    toast(`${decisionText[d]} ${item.contributor}${item.affectedReports ? ` · ${item.affectedReports} report holders notified` : ""}`);
  }

  const count = (f: Filter) => Math.max(0, queueCounts[f] - (f === "all" ? resolved : reviewQueue.filter((i) => i.category === f && !items.includes(i)).length));

  return (
    <div className="admin-layout">
      <div className="queue-col">
        <div style={{ padding: "16px 20px", borderBottom: "2px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontWeight: 800, fontSize: 18 }}>Review queue</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Filter queue">
            {FILTERS.map(([f, label]) => (
              <button key={f} className="pill-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {label} {count(f)}
              </button>
            ))}
          </div>
          <p className="small muted">Sorted by risk, then age</p>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {visible.map((i) => (
            <li key={i.id}>
              <button className={`queue-item${selected?.id === i.id ? " active" : ""}`} onClick={() => setSelectedId(i.id)} aria-current={selected?.id === i.id}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span className={`kicker ${kickerTone[i.severity]}`}>{i.kicker}</span>
                  <span className="small muted">{i.age}</span>
                </span>
                <span style={{ fontWeight: 800 }}>{i.title}</span>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{i.sub}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li style={{ padding: "20px", color: "var(--ink-3)", fontSize: 14 }}>Nothing left in this view. Nice work.</li>}
        </ul>
      </div>

      {selected ? <CaseDetail key={selected.id} item={selected} onDecide={decide} /> : <div style={{ padding: 24 }} className="muted">Select a case.</div>}
    </div>
  );
}

function CaseDetail({ item, onDecide }: { item: QueueItem; onDecide: (i: QueueItem, d: Decision) => void }) {
  const [reason, setReason] = useState(item.defaultReason);
  const [touched, setTouched] = useState(false);
  const missing = touched && !reason.trim();

  const act = (d: Decision) => {
    setTouched(true);
    if (!reason.trim()) return;
    onDecide(item, d);
  };

  return (
    <section className="case-col" aria-labelledby="case-h">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h2 id="case-h" className="card-title">
          {item.caseTitle}
        </h2>
        <span className="small muted">{item.caseRef}</span>
      </div>

      {item.records && (
        <div className="compare-grid">
          {item.records.map((r) => (
            <div key={r.label} className={`compare-cell${r.flagged ? " flagged" : ""}`}>
              <p className={`eyebrow${r.flagged ? " tone-red" : ""}`}>{r.label}</p>
              <p style={{ fontWeight: 800, fontSize: 20 }} className={r.flagged ? "tone-red" : undefined}>
                {fmtKm(r.km)} km
              </p>
              <p style={{ fontSize: 13 }}>
                {r.date} · {r.source}
              </p>
              <p className={`small ${r.evidenceOk ? "tone-green" : "tone-red"}`}>{r.evidence}</p>
              <p className="small muted">{r.trust}</p>
            </div>
          ))}
        </div>
      )}

      {item.likelyCause && (
        <div className="note">
          <strong>Likely cause:</strong> {item.likelyCause}
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="reason">
          Reason (shown to contributor) *
        </label>
        <textarea
          id="reason"
          className={`input sunken${missing ? " error" : ""}`}
          style={{ minHeight: 60, padding: 10 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={missing}
        />
        {missing && <p className="field-error">! Add a reason — the contributor sees this.</p>}
      </div>

      <div className="actions">
        <button className="btn btn-primary" onClick={() => act("request")}>
          Request info
        </button>
        {item.category === "partner" ? (
          <>
            <button className="btn btn-secondary" onClick={() => act("uphold")}>
              Approve partner
            </button>
            <button className="btn btn-danger" onClick={() => act("reject")}>
              Decline
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => act("correct")}>
              Correct record
            </button>
            <button className="btn btn-secondary" onClick={() => act("uphold")}>
              Uphold finding
            </button>
            <button className="btn btn-danger" onClick={() => act("reject")}>
              Reject record
            </button>
          </>
        )}
      </div>
      <p className="small muted">
        {item.affectedReports > 0 && `Affects ${item.affectedReports} purchased report${item.affectedReports > 1 ? "s" : ""} — holders will be notified of the outcome. `}
        Action logged as Lina A. · 2FA session.
      </p>
    </section>
  );
}
