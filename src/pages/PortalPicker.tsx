import { Link } from "react-router-dom";
import { BrandMark } from "../components/ui";

// Stand-in for sign-in: the real app routes each partner to their own portal.
const portals = [
  { to: "/garage", title: "Garage", org: "Mwangi Auto Works", body: "Record repairs and maintenance, attach invoices, answer disputes." },
  { to: "/dealer", title: "Dealer", org: "Prime Motors", body: "Manage inventory, check vehicles at intake, share reports with buyers." },
  { to: "/inspection", title: "Inspection centre", org: "Likoni Rd Centre", body: "Run today’s lanes and publish inspection results in bulk." },
  { to: "/admin", title: "SAZO admin", org: "Review queue", body: "Resolve mileage conflicts, disputes, partner anomalies and applications." },
];

export function PortalPicker() {
  return (
    <div className="picker">
      <header className="picker-head">
        <div className="picker-inner" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark size={22} />
          <span style={{ fontWeight: 800, fontSize: 19, marginLeft: 8 }}>SAZO</span>
          <span style={{ fontSize: 13, color: "var(--blue-on-navy)" }}>Partners</span>
        </div>
      </header>
      <main className="picker-inner" style={{ padding: "40px clamp(16px, 3vw, 40px) 96px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h1 className="page-title">Sign in as…</h1>
          <p className="page-sub">Demo build with sample data. Pick a portal.</p>
        </div>
        <div className="picker-grid">
          {portals.map((p) => (
            <Link key={p.to} to={p.to} className="picker-card">
              <span className="eyebrow">{p.title}</span>
              <span style={{ fontWeight: 800, fontSize: 20 }}>{p.org}</span>
              <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{p.body}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
