import { Link } from "react-router-dom";
import { garageNotifications } from "../../data/mock";
import { RecordBadge, StatStrip } from "../../components/ui";
import { MOBILE_QUERY, useMediaQuery, useStore } from "../../store";
import { RecordsTable } from "./RecordsTable";

const toneClass = { danger: "tone-red", warn: "tone-amber", verified: "tone-green" } as const;

export function GarageHome() {
  const mobile = useMediaQuery(MOBILE_QUERY);
  return mobile ? <MobileToday /> : <DesktopHome />;
}

function DesktopHome() {
  const { records } = useStore();
  const drafts = records.filter((r) => r.status === "draft").length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Good morning, Joseph</h1>
          <p className="page-sub">Monday 12 Oct · 6 vehicles booked in today</p>
        </div>
        <Link to="/garage/records/new" className="btn btn-primary btn-lg">
          + New record
        </Link>
      </div>

      <StatStrip
        items={[
          { label: "Records this month", value: 142 + (records.length - 5), note: <p className="stat-note tone-green">▲ 18 vs Sep</p> },
          { label: "Verified rate", value: "96%", note: <p className="stat-note">6 awaiting documents</p> },
          { label: "Drafts", value: drafts + 3, note: <p className="stat-note">2 on bay tablet</p> },
          { label: "Open disputes", value: 1, valueClass: "tone-amber", note: <p className="stat-note">Reply by 16 Oct</p> },
        ]}
      />

      <div className="home-grid">
        <div style={{ minWidth: 0 }}>
          <RecordsTable records={records} limit={8} />
        </div>
        <section style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }} aria-labelledby="notif-h">
          <p className="section-title" id="notif-h">
            Notifications
          </p>
          <div className="feed">
            {garageNotifications.map((n) => (
              <div className="feed-item" key={n.id}>
                <p className={`kicker ${toneClass[n.tone]}`}>{n.kicker}</p>
                <p className="body">{n.body}</p>
                {n.action && (
                  <Link to={n.action.to} style={{ fontSize: 13 }}>
                    {n.action.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// P7 — partner on mobile
function MobileToday() {
  const { records } = useStore();
  const today = records.slice(0, 6);
  return (
    <div className="page" style={{ paddingBottom: 96 }}>
      <h1 style={{ fontWeight: 800, fontSize: 22 }}>Today</h1>
      <div className="feed">
        {today.map((r) => (
          <div key={r.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--line-soft)", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <div>
              <p className="plate-text">{r.plate}</p>
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>{r.work}</p>
            </div>
            <RecordBadge status={r.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
