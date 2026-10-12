import { useMemo, useState } from "react";
import { fmtKm, type JobRecord, type RecordStatus } from "../../data/mock";
import { RecordBadge, SortHeader, recordStatusLabel } from "../../components/ui";

const statuses: RecordStatus[] = ["verified", "checking", "needs-invoice", "draft", "disputed", "queued"];
const statusOrder = Object.fromEntries(statuses.map((s, i) => [s, i])) as Record<RecordStatus, number>;

export function RecordsTable({
  records,
  title = "Recent records",
  initialQuery = "",
  limit,
}: {
  records: JobRecord[];
  title?: string;
  initialQuery?: string;
  limit?: number;
}) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<RecordStatus | "all">("all");
  const [staff, setStaff] = useState("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const staffNames = useMemo(() => [...new Set(records.map((r) => r.by))].sort(), [records]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, "");
    let out = records.filter(
      (r) =>
        (!needle || r.plate.toLowerCase().replace(/\s+/g, "").includes(needle) || r.id.toLowerCase().includes(needle)) &&
        (status === "all" || r.status === status) &&
        (staff === "all" || r.by === staff),
    );
    // Newest first by default; "Status" sorts problems (disputed, needs invoice) to the top when descending.
    if (sortDir) out = [...out].sort((a, b) => (statusOrder[a.status] - statusOrder[b.status]) * (sortDir === "desc" ? -1 : 1));
    return limit ? out.slice(0, limit) : out;
  }, [records, q, status, staff, sortDir, limit]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div className="toolbar">
        <p className="section-title">{title}</p>
        <div className="filters">
          <label>
            <span className="sr-only">Search plate or job number</span>
            <input className="field-inline" placeholder="Search plate or job no." value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Status</span>
            <select className="field-inline" value={status} onChange={(e) => setStatus(e.target.value as RecordStatus | "all")}>
              <option value="all">Status: All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {recordStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Staff</span>
            <select className="field-inline" value={staff} onChange={(e) => setStaff(e.target.value)}>
              <option value="all">Staff: All</option>
              {staffNames.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Plate</th>
              <th>Work</th>
              <th>km</th>
              <th>By</th>
              <SortHeader label="Status" active={!!sortDir} dir={sortDir ?? "desc"} onClick={() => setSortDir((d) => (d === "desc" ? "asc" : d === "asc" ? null : "desc"))} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 800, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{r.plate}</td>
                <td>{r.work}</td>
                <td>{fmtKm(r.km)}</td>
                <td>{r.by}</td>
                <td>
                  <RecordBadge status={r.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={5}>No records match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
