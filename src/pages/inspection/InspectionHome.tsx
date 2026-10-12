import { useState } from "react";
import { bulkUpload, lanes, type Lane, type UploadProblem } from "../../data/mock";
import { StatStrip } from "../../components/ui";
import { useStore } from "../../store";

function LaneState({ lane }: { lane: Lane }) {
  if (lane.state === "pass") return <span className="tone-green" style={{ fontSize: 12, fontWeight: 800 }}>✓ Pass</span>;
  if (lane.state === "fail") return <span className="tone-red-strong" style={{ fontSize: 12, fontWeight: 800 }}>✕ Fail · {lane.faults}</span>;
  return <span style={{ fontSize: 12, fontWeight: 600, color: "var(--blue-dark)" }}>In progress</span>;
}

function downloadCsv(name: string, rows: UploadProblem[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = ["row,plate,problem", ...rows.map((r) => [r.row, esc(r.plate), esc(r.problem + (r.suggestion ? ` Did you mean ${r.suggestion}?` : ""))].join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function InspectionHome() {
  const { toast } = useStore();
  const [done, setDone] = useState(38);
  const [problems, setProblems] = useState<UploadProblem[]>(bulkUpload.problems);
  const [ready, setReady] = useState(bulkUpload.rows - bulkUpload.problems.length);
  const [published, setPublished] = useState(false);

  function applySuggestion(p: UploadProblem) {
    setProblems((ps) => ps.filter((x) => x.row !== p.row));
    setReady((r) => r + 1);
    toast(`Row ${p.row} updated to ${p.suggestion}`);
  }

  function publish() {
    toast(`${ready} inspections published to vehicle histories`);
    setDone((d) => d + ready);
    setPublished(true);
  }

  return (
    <div className="page">
      <div className="inspection-grid">
        <section className="card" aria-labelledby="lanes-h">
          <div className="page-head">
            <div>
              <h1 className="card-title" id="lanes-h">
                Likoni Rd Centre
              </h1>
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>Mon 12 Oct · 3 lanes open</p>
            </div>
            <button className="btn btn-primary" onClick={() => toast("Choose a free lane to start an inspection")}>
              + Start inspection
            </button>
          </div>
          <StatStrip
            variant="tight"
            min={90}
            items={[
              { label: "Done", value: done },
              { label: "Pass rate", value: "81%" },
              { label: "Retests due", value: 7 },
            ]}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {lanes.map((l) => (
              <div className="lane-row" key={l.lane}>
                <span className="lane-tag">Lane {l.lane}</span>
                <div>
                  <p className="plate-text">{l.plate}</p>
                  <p className="small muted">{l.detail}</p>
                </div>
                <LaneState lane={l} />
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ gap: 14 }} aria-labelledby="bulk-h">
          <h2 className="card-title" id="bulk-h">
            Bulk upload · review
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface-sunken)", fontSize: 14, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600 }}>{bulkUpload.file}</span>
            <span className="muted">{bulkUpload.rows} rows</span>
            <button className="link" style={{ marginLeft: "auto" }} onClick={() => toast("Column mapping — coming soon")}>
              Column mapping
            </button>
          </div>

          {published ? (
            <div className="note">
              <strong>Published.</strong> {problems.length ? `${problems.length} row${problems.length > 1 ? "s are" : " is"} still held back for fixing.` : "Every row is now live."}
            </div>
          ) : (
            <>
              <div className="split-bar">
                <div style={{ flex: ready }} className="ok">
                  {ready} ready
                </div>
                {problems.length > 0 && (
                  <div style={{ flex: problems.length }} className="bad">
                    {problems.length} need fixing
                  </div>
                )}
              </div>
            </>
          )}

          {problems.length > 0 && (
            <div className="table-wrap">
              <table className="table dense">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Plate</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((p) => (
                    <tr key={p.row}>
                      <td>{p.row}</td>
                      <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{p.plate}</td>
                      <td className="tone-red">
                        {p.problem}
                        {p.suggestion && (
                          <>
                            {" "}
                            Did you mean <strong>{p.suggestion}</strong>?{" "}
                            <button className="link" style={{ color: "inherit" }} onClick={() => applySuggestion(p)}>
                              Use
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="actions" style={{ marginTop: "auto" }}>
            <button className="btn btn-secondary" disabled={!problems.length} onClick={() => downloadCsv(bulkUpload.file.replace(".csv", "-errors.csv"), problems)}>
              Download errors
            </button>
            <button className="btn btn-primary" disabled={published || ready === 0} onClick={publish}>
              Publish {published ? "" : `${ready} `}inspections
            </button>
          </div>
          <p className="small muted">Rows with problems are held back, not dropped. Fix them here or re-upload.</p>
        </section>
      </div>
    </div>
  );
}
