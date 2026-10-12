import { useMemo, useRef, useState } from "react";
import { dealerStock, fmtKm, type StockStatus, type StockVehicle } from "../../data/mock";
import { SortHeader, StatStrip, StockBadge } from "../../components/ui";
import { useStore } from "../../store";

type Tab = "all" | "intake" | "listed" | "reserved" | "sold";
const TABS: [Tab, string][] = [
  ["all", "All"],
  ["intake", "Intake"],
  ["listed", "Listed"],
  ["reserved", "Reserved"],
  ["sold", "Sold"],
];
// "Intake" covers vehicles still being checked and those held after a finding.
const tabMatches: Record<Tab, (s: StockStatus) => boolean> = {
  all: () => true,
  intake: (s) => s === "intake" || s === "on-hold",
  listed: (s) => s === "listed",
  reserved: (s) => s === "reserved",
  sold: (s) => s === "sold",
};

const hasFindings = (v: StockVehicle) => v.findings !== "checking" && v.findings.high + v.findings.check > 0;

function Findings({ v }: { v: StockVehicle }) {
  if (v.findings === "checking") return <span className="muted">Checking…</span>;
  const { high, check } = v.findings;
  if (!high && !check) return <span className="tone-green" style={{ fontWeight: 600 }}>✓ None</span>;
  return (
    <span aria-label={`${high} serious, ${check} to check`}>
      {high > 0 && <span className="tone-red-strong" style={{ fontWeight: 800 }}>! {high}</span>}
      {check > 0 && (
        <span className="tone-amber" style={{ fontWeight: 600 }}>
          {high > 0 ? " · " : ""}
          {check}
        </span>
      )}
    </span>
  );
}

export function Inventory() {
  const { toast } = useStore();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [findingsOnly, setFindingsOnly] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [alertOpen, setAlertOpen] = useState(true);
  const csvInput = useRef<HTMLInputElement>(null);

  const flagged = dealerStock.filter((v) => v.findings !== "checking" && v.findings.high > 0 && v.status === "on-hold");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = dealerStock.filter(
        (v) =>
          tabMatches[tab](v.status) &&
          (!findingsOnly || hasFindings(v)) &&
          (!needle || `${v.plate} ${v.make} ${v.model}`.toLowerCase().includes(needle)),
    );
    return sortDir ? out.sort((a, b) => (a.days - b.days) * (sortDir === "asc" ? 1 : -1)) : out;
  }, [q, tab, findingsOnly, sortDir]);

  async function copyLink(v: StockVehicle) {
    const url = `${location.origin}/r/${v.plate.replace(" ", "")}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(`Report link for ${v.plate} copied`);
    } catch {
      toast(url);
    }
  }

  return (
    <div className="page" style={{ gap: 20 }}>
      <div className="page-head">
        <h1 className="page-title">Inventory</h1>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => csvInput.current?.click()}>
            Import CSV
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) toast(`${f.name} received — we’ll check each plate and add them to Intake`);
              e.target.value = "";
            }}
          />
          <button className="btn btn-primary" onClick={() => toast("Add vehicle — coming soon")}>
            + Add vehicle
          </button>
        </div>
      </div>

      {alertOpen && flagged.length > 0 && (
        <div className="alert-danger" role="alert">
          <p className="title">
            ! {flagged.length} vehicle{flagged.length > 1 ? "s have" : " has"} a new finding since intake
          </p>
          <p className="body">{flagged[0].plate} — mileage inconsistency. Review before listing.</p>
          <button
            className="link"
            onClick={() => {
              setTab("intake");
              setFindingsOnly(true);
              setAlertOpen(false);
            }}
          >
            Review
          </button>
        </div>
      )}

      <StatStrip
        variant="compact"
        min={130}
        items={[
          { label: "In stock", value: 118 },
          { label: "Listed", value: 94 },
          { label: "Report views · 7d", value: "1,906" },
          { label: "Avg days to sale", value: 31, note: <p className="stat-note tone-green">▼ 6 with shared report</p> },
        ]}
      />

      <div className="filters">
        <label>
          <span className="sr-only">Search plate, make, model</span>
          <input className="field-inline" style={{ minWidth: 200, padding: "6px 10px" }} placeholder="Search plate, make, model" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="segmented" role="group" aria-label="Stock status">
          {TABS.map(([k, label]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <button className="chip-toggle" aria-pressed={findingsOnly} onClick={() => setFindingsOnly((f) => !f)}>
          {findingsOnly ? "Has findings ✕" : "+ Has findings"}
        </button>
      </div>

      <div className="table-wrap">
        <table className="table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Findings</th>
              <th>Status</th>
              <SortHeader label="Days" active={!!sortDir} dir={sortDir ?? "desc"} onClick={() => setSortDir((d) => (d === "desc" ? "asc" : d === "asc" ? null : "desc"))} />
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.plate}>
                <td>
                  <p className="plate-text">{v.plate}</p>
                  <p className="small muted">
                    {v.year} {v.make} {v.model} · {fmtKm(v.km)} km
                  </p>
                </td>
                <td>
                  <Findings v={v} />
                </td>
                <td>
                  <StockBadge status={v.status} />
                </td>
                <td>{v.days}</td>
                <td>
                  {v.shareViews !== undefined ? (
                    <>
                      <button className="link" style={{ fontSize: 14 }} onClick={() => copyLink(v)}>
                        Link · QR
                      </button>{" "}
                      <span className="small muted">{v.shareViews} views</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={5}>No vehicles match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
