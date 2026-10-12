// Sample data from the design handoff. The plates, places and KSh prices assume a
// Kenya-style market and are placeholders until the launch country is confirmed.

export type RecordStatus = "verified" | "checking" | "needs-invoice" | "draft" | "disputed" | "queued";

export interface JobRecord {
  id: string;
  plate: string;
  work: string;
  km: number;
  by: string;
  status: RecordStatus;
  date: string; // ISO date
}

export interface Vehicle {
  plate: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  lastOdometer: number;
  lastOdometerDate: string; // ISO date
}

export const vehicles: Vehicle[] = [
  { plate: "KDA 482Q", make: "Toyota", model: "RAV4", year: 2019, colour: "Silver", lastOdometer: 84210, lastOdometerDate: "2026-03-14" },
  { plate: "KCF 311M", make: "Subaru", model: "Forester", year: 2017, colour: "Blue", lastOdometer: 58020, lastOdometerDate: "2026-04-02" },
  { plate: "KBZ 908H", make: "Toyota", model: "Probox", year: 2014, colour: "White", lastOdometer: 139400, lastOdometerDate: "2026-01-20" },
  { plate: "KDD 450B", make: "Mazda", model: "Demio", year: 2020, colour: "Red", lastOdometer: 36110, lastOdometerDate: "2026-05-11" },
  { plate: "KCX 120T", make: "Honda", model: "CR-V", year: 2018, colour: "Black", lastOdometer: 109300, lastOdometerDate: "2026-02-08" },
  { plate: "KDB 077A", make: "Mazda", model: "CX-5", year: 2019, colour: "Grey", lastOdometer: 61900, lastOdometerDate: "2026-06-30" },
  { plate: "KDE 220C", make: "Nissan", model: "X-Trail", year: 2020, colour: "White", lastOdometer: 54120, lastOdometerDate: "2026-09-29" },
];

export function normalisePlate(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length > 3 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
}

export function findVehicle(plate: string): Vehicle | undefined {
  const p = normalisePlate(plate);
  return vehicles.find((v) => v.plate === p);
}

export const garageRecords: JobRecord[] = [
  { id: "J-1284", plate: "KDA 482Q", work: "Brake pads, front", km: 84560, by: "S. Otieno", status: "verified", date: "2026-10-12" },
  { id: "J-1283", plate: "KCF 311M", work: "Service · 60k", km: 60212, by: "J. Mwangi", status: "checking", date: "2026-10-12" },
  { id: "J-1282", plate: "KBZ 908H", work: "Clutch replacement", km: 142880, by: "S. Otieno", status: "needs-invoice", date: "2026-10-11" },
  { id: "J-1281", plate: "KDD 450B", work: "Diagnostic · ABS", km: 38004, by: "M. Wanjiru", status: "draft", date: "2026-10-11" },
  { id: "J-1280", plate: "KCX 120T", work: "Accident repair · front", km: 112600, by: "J. Mwangi", status: "disputed", date: "2026-10-09" },
];

export const workCatalogue = [
  "Brake pads · front",
  "Brake pads · rear",
  "Brake fluid",
  "Engine oil & filter",
  "Air filter",
  "Spark plugs",
  "Clutch replacement",
  "Timing belt",
  "Wheel alignment",
  "Battery",
  "Suspension · front",
  "Radiator",
];

export type NotificationTone = "danger" | "warn" | "verified";
export interface GarageNotification {
  id: string;
  tone: NotificationTone;
  kicker: string;
  body: string;
  action?: { label: string; to: string };
}

export const garageNotifications: GarageNotification[] = [
  { id: "n1", tone: "danger", kicker: "Dispute · reply by 16 Oct", body: "Owner of KCX 120T says the front repair didn’t include the radiator.", action: { label: "Respond", to: "/garage/records?q=KCX%20120T" } },
  { id: "n2", tone: "warn", kicker: "Needs info", body: "KBZ 908H — add an invoice to verify this record.", action: { label: "Upload", to: "/garage/records?q=KBZ%20908H" } },
  { id: "n3", tone: "verified", kicker: "Verified", body: "23 records verified overnight." },
];

// ---------- Dealer ----------
export type StockStatus = "on-hold" | "intake" | "listed" | "reserved" | "sold";
export interface StockVehicle {
  plate: string;
  year: number;
  make: string;
  model: string;
  km: number;
  findings: { high: number; check: number } | "checking";
  status: StockStatus;
  days: number;
  shareViews?: number;
}

export const dealerStock: StockVehicle[] = [
  { plate: "KDA 482Q", year: 2019, make: "Toyota", model: "RAV4", km: 84210, findings: { high: 1, check: 3 }, status: "on-hold", days: 12 },
  { plate: "KCX 120T", year: 2018, make: "Honda", model: "CR-V", km: 112600, findings: { high: 0, check: 0 }, status: "listed", days: 21, shareViews: 214 },
  { plate: "KDB 077A", year: 2019, make: "Mazda", model: "CX-5", km: 61900, findings: { high: 0, check: 2 }, status: "reserved", days: 44, shareViews: 88 },
  { plate: "KDE 220C", year: 2020, make: "Nissan", model: "X-Trail", km: 54120, findings: "checking", status: "intake", days: 1 },
  { plate: "KCU 614R", year: 2016, make: "Toyota", model: "Fielder", km: 131050, findings: { high: 0, check: 1 }, status: "sold", days: 27, shareViews: 162 },
];

// ---------- Inspection centre ----------
export interface Lane {
  lane: number;
  plate: string;
  detail: string;
  state: "in-progress" | "fail" | "pass";
  faults?: number;
}

export const lanes: Lane[] = [
  { lane: 1, plate: "KCF 311M", detail: "Brakes · step 4 of 9 · P. Kamau", state: "in-progress" },
  { lane: 2, plate: "KBZ 908H", detail: "Awaiting inspector sign-off", state: "fail", faults: 2 },
  { lane: 3, plate: "KDD 450B", detail: "Certificate issued 10:42", state: "pass" },
];

export interface UploadProblem {
  row: number;
  plate: string;
  problem: string;
  suggestion?: string;
}

export const bulkUpload = {
  file: "lane-export-2026-10-11.csv",
  rows: 64,
  problems: [
    { row: 12, plate: "KDQ 1O4L", problem: "Plate not found.", suggestion: "KDQ 104L" },
    { row: 27, plate: "KCA 551P", problem: "Odometer missing" },
    { row: 48, plate: "KBT 770D", problem: "Result “P/F” not recognised — use Pass, Advisory or Fail" },
  ] as UploadProblem[],
};

// ---------- Admin ----------
export type QueueCategory = "mileage" | "dispute" | "partner" | "anomaly";
export type Severity = "high" | "medium" | "info";

export interface QueueRecord {
  label: string;
  km: number;
  date: string;
  source: string;
  evidence: string;
  evidenceOk: boolean;
  trust: string;
  flagged?: boolean;
}

export interface QueueItem {
  id: string;
  category: QueueCategory;
  severity: Severity;
  kicker: string;
  age: string;
  title: string;
  sub: string;
  caseTitle: string;
  caseRef: string;
  records?: QueueRecord[];
  likelyCause?: string;
  defaultReason: string;
  contributor: string;
  affectedReports: number;
}

export const reviewQueue: QueueItem[] = [
  {
    id: "SZ-Q-40117",
    category: "mileage",
    severity: "high",
    kicker: "High · Mileage drop",
    age: "2 d",
    title: "KDA 482Q · −12,500 km",
    sub: "Prime Motors vs Mwangi Auto Works",
    caseTitle: "Mileage drop · KDA 482Q",
    caseRef: "Case SZ-Q-40117 · opened by rule M-02",
    records: [
      { label: "Record A", km: 61400, date: "14 Jan 2024", source: "Mwangi Auto Works", evidence: "Invoice ✓ · photo of dash ✓", evidenceOk: true, trust: "Partner score 98 · 3 yrs" },
      { label: "Record B", km: 48900, date: "3 Jun 2024", source: "Prime Motors (intake)", evidence: "No document", evidenceOk: false, trust: "Partner score 91 · 1 yr", flagged: true },
      { label: "Record C", km: 71200, date: "20 Feb 2025", source: "Likoni Rd Centre", evidence: "Certificate ✓", evidenceOk: true, trust: "Accredited centre" },
    ],
    likelyCause: "typo in Record B (48,900 vs 68,900 fits trend). Request evidence from Prime Motors before deciding.",
    defaultReason: "Please upload a dash photo or intake sheet for this vehicle.",
    contributor: "Prime Motors",
    affectedReports: 3,
  },
  {
    id: "SZ-Q-40121",
    category: "anomaly",
    severity: "high",
    kicker: "High · Partner anomaly",
    age: "5 h",
    title: "FastLane Garage · 212 records / day",
    sub: "14× its 30-day average",
    caseTitle: "Partner anomaly · FastLane Garage",
    caseRef: "Case SZ-Q-40121 · opened by rule P-07",
    likelyCause: "a back-office import of historic job cards. Confirm with the partner before pausing their submissions.",
    defaultReason: "We noticed an unusual number of records today. Were these imported from an older system?",
    contributor: "FastLane Garage",
    affectedReports: 0,
  },
  {
    id: "SZ-Q-40098",
    category: "dispute",
    severity: "medium",
    kicker: "Medium · Dispute",
    age: "4 d · SLA 6 d",
    title: "KCX 120T · repair scope",
    sub: "Owner vs Mwangi Auto Works",
    caseTitle: "Dispute · KCX 120T repair scope",
    caseRef: "Case SZ-Q-40098 · raised by vehicle owner",
    likelyCause: "the invoice lists front bumper and headlamp only. The radiator may have been replaced elsewhere.",
    defaultReason: "The owner says the radiator was part of this repair. Please confirm and attach the job card.",
    contributor: "Mwangi Auto Works",
    affectedReports: 1,
  },
  {
    id: "SZ-Q-40124",
    category: "partner",
    severity: "info",
    kicker: "Partner application",
    age: "1 d",
    title: "Coast Inspection Services",
    sub: "Accreditation docs uploaded",
    caseTitle: "Partner application · Coast Inspection Services",
    caseRef: "Application SZ-P-0412 · inspection centre",
    defaultReason: "Thanks — please also upload your NTSA accreditation certificate.",
    contributor: "Coast Inspection Services",
    affectedReports: 0,
  },
];

export const queueCounts = { all: 27, mileage: 6, dispute: 9, partner: 4, anomaly: 8 };

// ---------- Team ----------
export type Role = "Owner" | "Manager" | "Contributor" | "Contributor (drafts only)" | "Viewer";
export interface TeamMember {
  id: string;
  name: string;
  role: Role;
  twoFactor: "On" | "Bay PIN" | "—";
  lastActive: string;
  invited?: boolean;
}

export const team: TeamMember[] = [
  { id: "t1", name: "Joseph Mwangi", role: "Owner", twoFactor: "On", lastActive: "Now" },
  { id: "t2", name: "Mary Wanjiru", role: "Manager", twoFactor: "On", lastActive: "2 h ago" },
  { id: "t3", name: "Samuel Otieno", role: "Contributor", twoFactor: "Bay PIN", lastActive: "10 min ago" },
  { id: "t4", name: "Kevin Njoroge", role: "Contributor (drafts only)", twoFactor: "Bay PIN", lastActive: "Yesterday" },
  { id: "t5", name: "Ann Achieng", role: "Viewer", twoFactor: "—", lastActive: "", invited: true },
];

type Perm = true | false | string;
export const rolePermissions: Record<Role, { create: Perm; submit: Perm; editOthers: Perm; teamBilling: Perm }> = {
  Owner: { create: true, submit: true, editOthers: true, teamBilling: true },
  Manager: { create: true, submit: true, editOthers: true, teamBilling: "Team only" },
  Contributor: { create: true, submit: true, editOthers: false, teamBilling: false },
  "Contributor (drafts only)": { create: true, submit: "Needs approval", editOthers: false, teamBilling: false },
  Viewer: { create: false, submit: false, editOthers: false, teamBilling: false },
};

export const fmtKm = (n: number) => n.toLocaleString("en-GB");
export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
