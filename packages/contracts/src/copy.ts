// Plain-language wording for everything the trust engine and the API return as keys (en-UG).
// Rules (P-006): describe what the available records show — never certify, guarantee or "clear" a car.
// One catalogue for every screen (web, garage app, PDFs), so the wording is reviewed in one place.

type Params = Record<string, unknown> | undefined;
type Text = string | ((p: Record<string, unknown>) => string);

const n = (v: unknown) => Number(v ?? 0).toLocaleString('en-UG');
const plural = (count: unknown, one: string, many: string) => `${n(count)} ${Number(count) === 1 ? one : many}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-06-14" or an ISO time → "14 Jun 2024" (Ugandan convention). Precision "month"/"year" shortens it. */
export function formatDate(iso: string | null | undefined, precision: string = 'day'): string {
  if (!iso) return 'Date unknown';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (precision === 'year') return String(y);
  if (precision === 'month') return `${MONTHS[m! - 1]} ${y}`;
  if (precision === 'unknown') return 'Date unknown';
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

export const formatKm = (km: unknown) => `${n(km)} km`;
/** UGX 82,500,000 → "UGX 82.5M"; small amounts in full. */
export function formatUgx(amount: number, short = true): string {
  if (short && amount >= 1_000_000) return `UGX ${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  return `UGX ${n(amount)}`;
}

export const QUESTION_TITLES: Record<string, { short: string; ask: string }> = {
  identity: { short: 'Identity', ask: 'Is it really this car?' },
  care: { short: 'Care & servicing', ask: 'Has it been taken care of?' },
  damage: { short: 'Accidents & damage', ask: 'Has anything serious happened to it?' },
  mileage: { short: 'Mileage', ask: 'Can I trust the mileage?' },
  provenance: { short: 'Story', ask: "What's its story?" },
  legal_financial: { short: 'Money & legal', ask: 'Are there money or legal issues?' },
  valuation: { short: 'Price', ask: 'Is the price reasonable?' },
};
export const QUESTION_ORDER = ['identity', 'care', 'damage', 'mileage', 'provenance', 'legal_financial', 'valuation'] as const;

export const STATUS_LABELS: Record<string, string> = {
  verified: 'Consistent', attention: 'Worth a closer look', serious: 'Serious', not_available: 'Not available',
};

/** Status words that read naturally for each question (the price is an estimate, not "consistent"). */
export function statusLabel(question: string, status: string): string {
  if (question === 'valuation') return ({ verified: 'Estimate available', attention: 'Rough estimate', not_available: 'Not available' } as Record<string, string>)[status] ?? STATUS_LABELS[status]!;
  return STATUS_LABELS[status] ?? status;
}

const HEADLINES: Record<string, Text> = {
  // Identity
  'identity.verified.official_match': 'Chassis/VIN and plate match the official records we have.',
  'identity.serious.cloned_plate_suspected': 'This number plate also appears on another vehicle. It may be a cloned plate.',
  'identity.serious.plate_vin_mismatch': 'The plate and the chassis/VIN point to different vehicles in the records.',
  'identity.serious.identity_collision': 'Records for this car disagree about which vehicle it is.',
  'identity.serious.spec_mismatch': 'The make, model or year in the records does not match.',
  'identity.attention.undeclared_engine_change': 'The engine number differs from the record, and no engine replacement was recorded.',
  'identity.attention.colour_mismatch': (p) => `The colour seen at inspection (${p.observed ?? 'different'}) differs from the registered colour (${p.expected ?? 'unknown'}).`,
  'identity.attention.provisional': 'This car was added by a user and is not yet confirmed by an official record.',
  'identity.not_available.no_official_record': "We don't have an official registration or import record for this car yet.",
  // Care
  'care.verified.regular_services': (p) => `${plural(p.visits, 'service visit', 'service visits')} recorded in the last 3 years.`,
  'care.attention.single_recent_service': 'Only one service is recorded in the last 3 years.',
  'care.attention.service_gap': (p) => `No service recorded since ${formatDate(String(p.lastService ?? ''))}.`,
  'care.attention.disputed': 'An owner disputed one of the garage records.',
  'care.attention.low_confidence_records': 'Service records exist, but they are not well supported by evidence.',
  'care.not_available.no_service_records': "We don't have any service records for this car yet.",
  // Damage
  'damage.verified.none_found': (p) => {
    const checked = (p.checked as string[] | undefined) ?? [];
    const names = checked.map((c) => (c === 'police' ? 'police' : c === 'insurer' ? 'insurer' : c)).join(' and ');
    return `No accident or damage records found${names ? ` in the ${names} records we have` : ''}.`;
  },
  'damage.attention.non_structural': 'There is an accident record — reported as minor, but worth a closer look.',
  'damage.serious.structural': 'Records show structural damage.',
  'damage.serious.flood': 'Records show flood damage.',
  'damage.serious.total_loss': (p) => (p.rebuilt ? 'An insurer declared it a total loss; it was later rebuilt.' : 'An insurer declared it a total loss.'),
  'damage.serious.conflict': 'Records disagree about damage to this car.',
  'damage.not_available.no_coverage': "We don't have police or insurance records that cover this car yet.",
  // Mileage
  'mileage.verified.consistent': (p) => `${plural(p.readings, 'reading rises', 'readings rise')} steadily over time.`,
  'mileage.serious.decrease': (p) => `A reading of ${formatKm(p.laterKm)} came after an earlier reading of ${formatKm(p.earlierKm)}. The odometer may have been wound back.`,
  'mileage.attention.implausible_rate': (p) => `About ${formatKm(p.kmPerYear)} a year — more than is usual for this kind of use.`,
  'mileage.attention.odometer_replaced': (p) => `The odometer was replaced${p.replacedOn ? ` on ${formatDate(String(p.replacedOn))}` : ''}${p.estimatedTotalKm ? `; total distance is estimated at ${formatKm(p.estimatedTotalKm)}` : ''}.`,
  'mileage.attention.single_reading': 'Only one mileage reading is recorded, so we cannot check it against others.',
  'mileage.attention.short_history': 'Mileage readings cover only a short period.',
  'mileage.not_available.no_readings': "We don't have any mileage readings for this car yet.",
  // Story
  'provenance.verified.import_recorded': 'Import and registration records were found.',
  'provenance.verified.new_vehicle': 'Registered as a new vehicle.',
  'provenance.attention.usage_rental': 'Used as a rental car at some point.',
  'provenance.attention.usage_commercial': 'Used commercially at some point.',
  'provenance.attention.usage_psv': 'Used as a public service vehicle (taxi or bus) at some point.',
  'provenance.attention.title_rebuilt': 'Rebuilt after being declared a total loss.',
  'provenance.attention.title_total_loss': 'Declared a total loss by an insurer.',
  'provenance.attention.export_mileage_conflict': 'The mileage at export is higher than later readings.',
  'provenance.not_available.no_origin_record': "We don't have import or first-registration records for this car yet.",
  // Money & legal (O-001: status only)
  'legal_financial.verified.none_active': 'No active finance, stolen-vehicle or impound record found in the records we have.',
  'legal_financial.attention.finance_active': 'Active finance is on record. Ask the seller for proof it has been paid off before buying.',
  'legal_financial.attention.stolen_recovered': (p) => `Reported stolen in the past and recovered${p.recoveredOn ? ` on ${formatDate(String(p.recoveredOn))}` : ''}.`,
  'legal_financial.attention.recently_released': 'Recently released from police impound.',
  'legal_financial.serious.stolen_open': 'There is an open stolen-vehicle report for this car.',
  'legal_financial.serious.impounded': 'Records show this car is currently impounded.',
  'legal_financial.not_available.no_coverage': "We don't have finance or police records that cover this car yet.",
  // Price
  'valuation.verified.comparables': (p) => `Estimate based on ${plural(p.comparables, 'comparable sale', 'comparable sales')} in the last 12 months.`,
  'valuation.attention.few_comparables': (p) => `Rough estimate — only ${plural(p.comparables, 'comparable sale', 'comparable sales')} found.`,
  'valuation.attention.rebuilt_adjusted': 'Rebuilt cars usually sell below the range for similar cars.',
  'valuation.not_available.too_few_comparables': 'Not enough comparable sales to estimate a price yet.',
  // Notes and conflicts
  'identity.note.engine_replaced': (p) => `Engine replaced${p.on ? ` on ${formatDate(String(p.on))}` : ''} (recorded).`,
  'identity.note.full_repaint': (p) => `Fully repainted${p.from && p.to ? ` from ${p.from} to ${p.to}` : ''}.`,
  'legal.note.previous_loan_cleared': 'A previous loan on this car was recorded as paid off.',
  'legal.note.past_stolen_recovered': 'It was once reported stolen and later recovered.',
  'conflict.mileage.open': 'Mileage records disagree — under review.',
  'conflict.identity.open': 'Identity records disagree — under review.',
  'conflict.damage.open': 'Damage records disagree — under review.',
  'conflict.ownership.open': 'Ownership records disagree — under review.',
  'conflict.finance.open': 'Finance records disagree — under review.',
  'conflict.spec.open': 'Specification records disagree — under review.',
  'conflict.care.open': 'Service records are disputed — under review.',
  'conflict.legal.open': 'Legal records disagree — under review.',
};

export const HEALTH_FACTORS: Record<string, string> = {
  'health.deduction.accidents': 'Accident records',
  'health.deduction.age': 'Age of the car',
  'health.deduction.care_attention': 'Gaps in servicing',
  'health.deduction.flood': 'Flood damage',
  'health.deduction.inspection_defects': 'Defects found at inspection',
  'health.deduction.mileage_attention': 'Mileage questions',
  'health.deduction.mileage_over_50k': 'Distance driven',
  'health.deduction.mileage_serious': 'Mileage may have been wound back',
  'health.deduction.odometer_replaced': 'Odometer replaced',
  'health.deduction.rental_or_commercial_use': 'Rental or commercial use',
  'health.deduction.structural_damage': 'Structural damage',
  'health.deduction.rebuilt': 'Rebuilt after a total loss',
  'health.deduction.total_loss': 'Declared a total loss',
};

export const CONFIDENCE_LABELS: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', insufficient: 'Too few records' };

export const RECORD_LABELS: Record<string, string> = {
  identifier_assigned: 'Identifier recorded', spec_declared: 'Specification', import_recorded: 'Import', customs_cleared: 'Customs clearance',
  registration_issued: 'Registration', plate_changed: 'Plate changed', deregistered: 'Deregistered', ownership_transferred: 'Change of owner',
  usage_declared: 'Type of use', rental_period: 'Rental period', odometer_reading: 'Mileage reading', service_performed: 'Service',
  component_replaced: 'Part replaced', repair_performed: 'Repair', paint_work: 'Paint work', accident_reported: 'Accident reported',
  damage_assessed: 'Damage assessed', insurance_claim: 'Insurance claim', total_loss_declared: 'Total loss declared',
  flood_damage_reported: 'Flood damage reported', stolen_reported: 'Reported stolen', stolen_recovered: 'Recovered after theft',
  impounded: 'Impounded', released: 'Released from impound', finance_lien_registered: 'Finance registered',
  finance_lien_discharged: 'Finance paid off', inspection_result: 'Inspection', listing_published: 'Listed for sale',
  sale_recorded: 'Sale', auction_sale: 'Auction sale', cost_recorded: 'Cost recorded',
};

export const EVENT_LABELS: Record<string, string> = {
  garage_job: 'Garage visit', inspection: 'Inspection', import: 'Import', registration: 'Registration', police_report: 'Police record',
  finance_change: 'Finance record', insurance_event: 'Insurance record', auction_sale: 'Auction', rental_period: 'Rental',
  owner_submission: 'Owner record', other: 'Record',
};

export const WORK_LABELS: Record<string, string> = {
  service: 'Service', repair: 'Repair', accident_damage: 'Accident repairs', body_paint: 'Paint work', engine: 'Engine work',
  transmission: 'Gearbox work', electrical: 'Electrical work', inspection: 'Inspection', other: 'Other work',
};

export const FACT_LABELS: Record<string, string> = {
  make: 'Make', model: 'Model', year: 'Year', body: 'Body', fuel: 'Fuel', transmission: 'Gearbox',
  registered_colour: 'Registered colour', current_colour: 'Colour now', current_plate: 'Plate', previous_plates: 'Previous plates',
  current_mileage_km: 'Mileage (best estimate)', owner_count: 'Owners', usage_type: 'Use', finance_status: 'Finance', stolen_status: 'Stolen report',
  impound_status: 'Impound', title_status: 'Title', import_origin: 'Imported from', first_registration_date: 'First registered',
  registered_engine_number: 'Engine number (registered)', current_engine_number: 'Engine number (now)',
};

const VALUE_WORDS: Record<string, string> = {
  cvt: 'CVT automatic', automatic: 'Automatic', manual: 'Manual', petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric',
  clean: 'No total loss on record', rebuilt: 'Rebuilt after total loss', total_loss: 'Total loss', active: 'Active finance on record',
  cleared: 'Paid off', open: 'Open report', recovered: 'Recovered', impounded: 'Impounded', released: 'Released',
  private: 'Private', commercial: 'Commercial', rental: 'Rental', psv: 'Public service vehicle',
  JP: 'Japan', GB: 'United Kingdom', AE: 'United Arab Emirates', ZA: 'South Africa', SG: 'Singapore', TH: 'Thailand', DE: 'Germany',
};

/** A fact value for display: units, dates, plain words. */
export function factValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (key === 'current_mileage_km') return formatKm(value);
  if (key === 'first_registration_date') return formatDate(String(value));
  if (key === 'owner_count') return plural(value, 'owner', 'owners');
  if (Array.isArray(value)) return value.join(', ');
  const s = String(value);
  return VALUE_WORDS[s] ?? (key.includes('colour') ? s.charAt(0).toUpperCase() + s.slice(1) : s);
}

/** The sentence for a headline key. Unknown keys fall back to a neutral line, never to a guess. */
export function headline(key: string, params?: Params): string {
  const t = HEADLINES[key];
  if (!t) return 'See the records below for details.';
  return typeof t === 'function' ? t(params ?? {}) : t;
}

/** Figure-free wording for the public summary (P-002: one status and one line, no figures or details). */
const SUMMARY_LINES: Record<string, string> = {
  'identity.attention.colour_mismatch': 'The colour seen at inspection differs from the registered colour.',
  'care.verified.regular_services': 'Regular services are recorded.',
  'care.attention.service_gap': 'No recent service is recorded.',
  'care.attention.single_recent_service': 'Only one recent service is recorded.',
  'damage.verified.none_found': 'No accident or damage records found in the records we have.',
  'damage.serious.total_loss': 'An insurer declared it a total loss.',
  'mileage.verified.consistent': 'Mileage readings rise steadily over time.',
  'mileage.serious.decrease': 'A later mileage reading is lower than an earlier one. The odometer may have been wound back.',
  'mileage.attention.implausible_rate': 'More distance per year than is usual for this kind of use.',
  'mileage.attention.odometer_replaced': 'The odometer was replaced.',
  'legal_financial.attention.stolen_recovered': 'Reported stolen in the past and recovered.',
  'valuation.verified.comparables': 'An estimated price range is available.',
  'valuation.attention.few_comparables': 'A rough price estimate is available.',
  'valuation.attention.rebuilt_adjusted': 'A price estimate is available; rebuilt cars usually sell for less.',
  'valuation.not_available.too_few_comparables': 'Not enough comparable sales to estimate a price yet.',
};

export function summaryLine(key: string): string {
  return SUMMARY_LINES[key] ?? headline(key, {});
}

export const ALL_HEADLINE_KEYS = Object.keys(HEADLINES);

/** Phrases SAZO must never use (P-006). Checked by a test over this catalogue and by UI tests. */
export const BANNED_PHRASES = [/guarantee/i, /warrant(y|ied)/i, /100\s*%/, /\bcleared\b(?! by)/i, /proceed with confidence/i, /buyer protection/i, /free to transfer/i, /certif(y|ied)/i, /no accidents\b/i];
