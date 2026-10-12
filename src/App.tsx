import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BranchPicker, Shell, type PortalConfig } from "./components/Shell";
import { Toasts } from "./components/ui";
import { garageNotifications } from "./data/mock";
import { ReviewQueue } from "./pages/admin/ReviewQueue";
import { Inventory } from "./pages/dealer/Inventory";
import { GarageHome } from "./pages/garage/GarageHome";
import { NewRecord } from "./pages/garage/NewRecord";
import { RecordsTable } from "./pages/garage/RecordsTable";
import { ScanPlate } from "./pages/garage/ScanPlate";
import { InspectionHome } from "./pages/inspection/InspectionHome";
import { PortalPicker } from "./pages/PortalPicker";
import { Placeholder } from "./pages/shared/Placeholder";
import { Team } from "./pages/shared/Team";
import { useStore } from "./store";

const partnerMobileNav = (base: string, records: string) => [
  { label: "Home", to: base, end: true },
  { label: "Records", to: `${base}/${records}` },
  { label: "Alerts", to: `${base}/notifications` },
  { label: "More", to: `${base}/team` },
];

function useGarageConfig(): PortalConfig {
  const { records } = useStore();
  return {
    variant: "partner",
    brand: "SAZO Partners",
    org: "Mwangi Auto Works",
    orgDetail: <span className="verified-chip">✓ Verified garage</span>,
    nav: [
      { label: "Home", to: "/garage", end: true },
      { label: "Job records", to: "/garage/records", end: true, count: (1279 + records.length).toLocaleString("en-GB") },
      { label: "Vehicles", to: "/garage/vehicles" },
      { label: "Documents", to: "/garage/documents" },
      { label: "Notifications", to: "/garage/notifications", pill: garageNotifications.length },
      { label: "Analytics", to: "/garage/analytics" },
      { label: "Team & permissions", to: "/garage/team" },
      { label: "Settings", to: "/garage/settings" },
    ],
    mobileNav: partnerMobileNav("/garage", "records"),
    user: { name: "Joseph Mwangi", role: "Owner" },
    fab: { label: "+ New record", to: "/garage/scan" },
  };
}

const dealerConfig: PortalConfig = {
  variant: "partner",
  brand: "SAZO Partners",
  org: "Prime Motors",
  orgDetail: <BranchPicker />,
  nav: [
    { label: "Home", to: "/dealer/home" },
    { label: "Inventory", to: "/dealer", end: true, count: 118 },
    { label: "Intake checks", to: "/dealer/intake" },
    { label: "Shared reports", to: "/dealer/shared" },
    { label: "Leads", to: "/dealer/leads" },
    { label: "Analytics", to: "/dealer/analytics" },
    { label: "Team & permissions", to: "/dealer/team" },
  ],
  mobileNav: [
    { label: "Inventory", to: "/dealer", end: true },
    { label: "Intake", to: "/dealer/intake" },
    { label: "Leads", to: "/dealer/leads" },
    { label: "More", to: "/dealer/team" },
  ],
  user: { name: "Grace Muthoni", role: "Sales manager" },
};

const inspectionConfig: PortalConfig = {
  variant: "partner",
  brand: "SAZO Partners",
  org: "Likoni Rd Centre",
  orgDetail: <span className="verified-chip">✓ Accredited centre</span>,
  nav: [
    { label: "Today’s lanes", to: "/inspection", end: true, count: 3 },
    { label: "Inspections", to: "/inspection/inspections" },
    { label: "Bulk upload", to: "/inspection/upload" },
    { label: "Retests", to: "/inspection/retests", count: 7 },
    { label: "Analytics", to: "/inspection/analytics" },
    { label: "Team & permissions", to: "/inspection/team" },
  ],
  mobileNav: [
    { label: "Lanes", to: "/inspection", end: true },
    { label: "Inspections", to: "/inspection/inspections" },
    { label: "Retests", to: "/inspection/retests" },
    { label: "More", to: "/inspection/team" },
  ],
  user: { name: "Peter Kamau", role: "Lead inspector" },
};

const adminConfig: PortalConfig = {
  variant: "admin",
  brand: "SAZO Admin",
  nav: [
    { label: "Overview", to: "/admin/overview" },
    { label: "Review queue", to: "/admin", end: true, count: 27 },
    { label: "Disputes", to: "/admin/disputes", count: 9 },
    { label: "Partners", to: "/admin/partners", count: "4 new" },
    { label: "Users", to: "/admin/users" },
    { label: "Data quality", to: "/admin/data-quality" },
    { label: "Audit log", to: "/admin/audit" },
  ],
  mobileNav: [
    { label: "Queue", to: "/admin", end: true },
    { label: "Disputes", to: "/admin/disputes" },
    { label: "Partners", to: "/admin/partners" },
    { label: "More", to: "/admin/overview" },
  ],
  user: { name: "Lina A.", role: "Data quality lead" },
};

function GarageRecords() {
  const { records } = useStore();
  const q = new URLSearchParams(useLocation().search).get("q") ?? "";
  return (
    <div className="page">
      <h1 className="page-title">Job records</h1>
      <RecordsTable key={q} records={records} title="All records" initialQuery={q} />
    </div>
  );
}

const placeholders = (pairs: [string, string][]) => pairs.map(([path, title]) => <Route key={path} path={path} element={<Placeholder title={title} />} />);

export function App() {
  const garage = useGarageConfig();
  return (
    <>
      <Routes>
        <Route path="/" element={<PortalPicker />} />
        <Route path="/garage/scan" element={<ScanPlate />} />
        <Route path="/garage" element={<Shell config={garage} />}>
          <Route index element={<GarageHome />} />
          <Route path="records" element={<GarageRecords />} />
          <Route path="records/new" element={<NewRecord />} />
          <Route path="team" element={<Team />} />
          {placeholders([
            ["vehicles", "Vehicles"],
            ["documents", "Documents"],
            ["notifications", "Notifications"],
            ["analytics", "Analytics"],
            ["settings", "Settings"],
          ])}
        </Route>
        <Route path="/dealer" element={<Shell config={dealerConfig} />}>
          <Route index element={<Inventory />} />
          <Route path="team" element={<Team />} />
          {placeholders([
            ["home", "Home"],
            ["intake", "Intake checks"],
            ["shared", "Shared reports"],
            ["leads", "Leads"],
            ["analytics", "Analytics"],
          ])}
        </Route>
        <Route path="/inspection" element={<Shell config={inspectionConfig} />}>
          <Route index element={<InspectionHome />} />
          <Route path="upload" element={<InspectionHome />} />
          <Route path="team" element={<Team />} />
          {placeholders([
            ["inspections", "Inspections"],
            ["retests", "Retests"],
            ["analytics", "Analytics"],
          ])}
        </Route>
        <Route path="/admin" element={<Shell config={adminConfig} />}>
          <Route index element={<ReviewQueue />} />
          {placeholders([
            ["overview", "Overview"],
            ["disputes", "Disputes"],
            ["partners", "Partners"],
            ["users", "Users"],
            ["data-quality", "Data quality"],
            ["audit", "Audit log"],
          ])}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
