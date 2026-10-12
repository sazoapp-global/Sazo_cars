import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "../store";
import { BrandMark } from "./ui";

export interface NavEntry {
  label: string;
  to: string;
  end?: boolean;
  count?: ReactNode;
  pill?: ReactNode;
}

export interface PortalConfig {
  variant: "partner" | "admin";
  brand: string;
  org?: string;
  orgDetail?: ReactNode;
  nav: NavEntry[];
  mobileNav: NavEntry[];
  user?: { name: string; role: string };
  fab?: { label: string; to: string };
}

function BranchPicker() {
  const [branch, setBranch] = useState("Mombasa Rd");
  return (
    <label className="sidebar-sub">
      <span className="sr-only">Branch</span>
      Branch:{" "}
      <select value={branch} onChange={(e) => setBranch(e.target.value)}>
        <option>Mombasa Rd</option>
        <option>Thika Rd</option>
        <option>Nyali</option>
      </select>
    </label>
  );
}
export { BranchPicker };

export function Shell({ config }: { config: PortalConfig }) {
  const { online, records } = useStore();
  const queued = records.filter((r) => r.status === "queued").length;
  const location = useLocation();
  const hideFab = config.fab && (location.pathname.startsWith(config.fab.to) || location.pathname.endsWith("/records/new"));

  return (
    <div className="shell">
      <aside className={`sidebar${config.variant === "admin" ? " admin" : ""}`} aria-label="Main navigation">
        <div className="sidebar-head">
          <Link to="/" className="brand">
            <BrandMark />
            <span className="brand-name">{config.brand}</span>
          </Link>
          {config.org && <p className="sidebar-org">{config.org}</p>}
          {config.orgDetail}
        </div>
        <nav style={{ display: "flex", flexDirection: "column" }}>
          {config.nav.map((n) => (
            <NavLink key={n.to + n.label} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <span>{n.label}</span>
              {n.count !== undefined && <span className="count">{n.count}</span>}
              {n.pill !== undefined && <span className="pill">{n.pill}</span>}
            </NavLink>
          ))}
        </nav>
        {config.user && (
          <div className="sidebar-foot">
            <p style={{ fontWeight: 600 }}>{config.user.name}</p>
            <p className="role">{config.user.role}</p>
          </div>
        )}
      </aside>

      <div className="main">
        <div className={`mobile-top${config.variant === "admin" ? " admin" : ""}`}>
          <Link to="/" className="brand" style={{ color: "#fff" }}>
            <BrandMark />
            <span className="brand-name">{config.brand}</span>
          </Link>
          {config.org && <span className="org">{config.org}</span>}
        </div>
        {!online && (
          <div className="offline-bar" role="status">
            <strong>You’re offline</strong>
            <span>
              {queued > 0
                ? `${queued} record${queued > 1 ? "s" : ""} saved on this device. They’ll upload automatically.`
                : "New records will be saved on this device and upload automatically."}
            </span>
          </div>
        )}
        <main style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </main>
        {config.fab && !hideFab && (
          <Link className="fab" to={config.fab.to}>
            {config.fab.label}
          </Link>
        )}
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {config.mobileNav.map((n) => (
            <NavLink key={n.label} to={n.to} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
