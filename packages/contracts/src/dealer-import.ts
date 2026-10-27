// A dealer adds many cars at once from an Excel or CSV file (D-131). These are the file's columns and the rules
// for reading each cell. The website reads the file; the API checks every row again with the same rules.
import { normalizeIdentifier } from './identifiers.js';
import { KIND_LABELS, kindFromText, type VehicleKind } from './vehicle-kinds.js';

/** Most cars one file can carry (equal to a dealer's daily limit). */
export const DEALER_IMPORT_MAX_ROWS = 200;

export const IMPORT_COST_CATEGORIES = [
  ['purchase', 'Car price (purchase or auction)'], ['freight_insurance', 'Freight and marine insurance'], ['port_shipping', 'Port and shipping charges'],
  ['customs_taxes', 'Customs taxes'], ['clearing_agent', 'Clearing agent'], ['transport', 'Transport to the yard'],
  ['inspection_repairs', 'Inspection and repairs'], ['registration_plates', 'Registration and number plates'], ['other', 'Other costs'],
] as const;
export type ImportCostCategory = (typeof IMPORT_COST_CATEGORIES)[number][0];

export interface DealerImportColumn { key: string; label: string; example: string; aliases?: string[] }

/** The template's columns, in order. Cost columns are for managers only. */
export const DEALER_IMPORT_COLUMNS: DealerImportColumn[] = [
  { key: 'make', label: 'Make', example: 'Toyota' },
  { key: 'model', label: 'Model', example: 'Harrier' },
  { key: 'year', label: 'Year', example: '2018', aliases: ['model year'] },
  // D-148: left empty, SAZO fills it in from the chassis code or the model when it can tell.
  { key: 'kind', label: 'Kind of car', example: 'SUV', aliases: ['kind', 'body', 'body type', 'type', 'vehicle type'] },
  { key: 'engineCc', label: 'Engine (cc)', example: '2000', aliases: ['engine', 'cc', 'engine cc'] },
  { key: 'fuel', label: 'Fuel', example: 'Petrol' },
  { key: 'gearbox', label: 'Gearbox', example: 'Automatic', aliases: ['transmission'] },
  { key: 'colour', label: 'Colour', example: 'Pearl white', aliases: ['color'] },
  { key: 'chassis', label: 'Chassis number or VIN', example: 'ZSU60-0099887', aliases: ['chassis', 'chassis number', 'chassis no', 'vin', 'frame number'] },
  { key: 'plate', label: 'Number plate', example: '', aliases: ['plate', 'registration', 'reg no', 'registration number'] },
  { key: 'price', label: 'Asking price (UGX)', example: '75000000', aliases: ['asking price', 'price', 'selling price'] },
  { key: 'stage', label: 'Where is it now', example: 'Shipping', aliases: ['stage', 'status', 'location'] },
  { key: 'yard', label: 'Bond or yard', example: 'Kyambogo', aliases: ['bond', 'yard'] },
  { key: 'receivedOn', label: 'Date received', example: '2026-10-01', aliases: ['received', 'date in'] },
  { key: 'bondArrivedOn', label: 'Bond arrival date', example: '', aliases: ['bond arrival', 'date in bond'] },
  { key: 'notes', label: 'Notes for your team', example: '', aliases: ['notes', 'note'] },
  { key: 'costCurrency', label: 'Cost currency', example: 'USD', aliases: ['currency'] },
  { key: 'costRate', label: 'Rate to UGX', example: '3700', aliases: ['rate', 'exchange rate'] },
  ...IMPORT_COST_CATEGORIES.map(([k, label]) => ({ key: `cost_${k}`, label, example: k === 'purchase' ? '9500' : k === 'freight_insurance' ? '1500' : '' })),
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_KEYS = new Map<string, string>();
for (const c of DEALER_IMPORT_COLUMNS) for (const name of [c.label, c.key, ...(c.aliases ?? [])]) HEADER_KEYS.set(squash(name), c.key);

/** The column key for a header cell the dealer's file uses, or undefined for a column SAZO does not read. */
export function importHeaderKey(header: string): string | undefined {
  return HEADER_KEYS.get(squash(header));
}

export interface DealerImportRow {
  make?: string; model?: string; modelYear?: number; kind?: VehicleKind; engineCc?: number; fuel?: string; transmission?: string; colour?: string;
  chassisNumber?: string; vin?: string; plate?: string; askingPriceUgx?: number; stage: string; yard?: string;
  receivedOn?: string; bondArrivedOn?: string; notes?: string;
  costs: { category: ImportCostCategory; amount: number; currency: string; rateToUgx?: number }[];
}

const FUEL: Record<string, string> = { petrol: 'petrol', diesel: 'diesel', hybrid: 'hybrid', electric: 'electric', ev: 'electric', lpg: 'lpg', gas: 'lpg', gaslpg: 'lpg', other: 'other' };
const GEAR: Record<string, string> = { automatic: 'automatic', auto: 'automatic', at: 'automatic', manual: 'manual', mt: 'manual', cvt: 'cvt', other: 'other' };
const STAGE: Record<string, string> = {
  bought: 'bought', shipping: 'shipping', onthesea: 'shipping', atport: 'at_port', attheport: 'at_port', port: 'at_port', mombasa: 'at_port', dar: 'at_port', daressalaam: 'at_port',
  inbond: 'in_bond', inthebond: 'in_bond', bond: 'in_bond', cleared: 'cleared', atyard: 'at_yard', attheyard: 'at_yard', yard: 'at_yard',
};

function number(s: string): number | undefined {
  const t = s.replace(/ugx|\/=|shs?|,|\s/gi, '');
  if (!t) return undefined;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/** A date as YYYY-MM-DD from YYYY-MM-DD or day-first D/M/YYYY (as written in Uganda). */
function day(s: string): string | undefined | null {
  const t = s.trim();
  if (!t) return undefined;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (r) { y = +r[1]!; m = +r[2]!; d = +r[3]!; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) { d = +r[1]!; m = +r[2]!; y = +r[3]!; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Read one row of the file. Returns the car and, in plain words, every reason it cannot be added yet.
 * `raw` is keyed by column key (see `importHeaderKey`). Costs are read only when `withCosts`.
 */
export function parseDealerImportRow(raw: Record<string, string>, withCosts: boolean): { row: DealerImportRow; problems: string[] } {
  const v = (k: string) => (raw[k] ?? '').toString().trim();
  const problems: string[] = [];
  const row: DealerImportRow = { stage: 'at_yard', costs: [] };
  const thisYear = new Date().getUTCFullYear();

  const text = (k: string, field: 'make' | 'model' | 'colour' | 'yard', label: string, min: number, max: number) => {
    const s = v(k);
    if (!s) return;
    if (s.length < min || s.length > max) problems.push(`${label} should be ${min} to ${max} letters`);
    else row[field] = s;
  };
  text('make', 'make', 'Make', 2, 40);
  text('model', 'model', 'Model', 1, 60);
  text('colour', 'colour', 'Colour', 2, 30);
  text('yard', 'yard', 'Bond or yard', 2, 80);

  const year = number(v('year'));
  if (year !== undefined) {
    if (!Number.isInteger(year) || year < 1950 || year > thisYear + 1) problems.push(`Year should be between 1950 and ${thisYear + 1}`);
    else row.modelYear = year;
  }
  if (v('kind')) {
    const k = kindFromText(v('kind'));
    if (k) row.kind = k; else problems.push(`Kind of car should be one of: ${Object.values(KIND_LABELS).join(', ')}`);
  }
  const cc = number(v('engineCc'));
  if (cc !== undefined) {
    if (!Number.isInteger(cc) || cc < 50 || cc > 20000) problems.push('Engine (cc) should be a number such as 1500');
    else row.engineCc = cc;
  }
  if (v('fuel')) {
    const f = FUEL[squash(v('fuel'))];
    if (f) row.fuel = f; else problems.push('Fuel should be Petrol, Diesel, Hybrid, Electric, Gas (LPG) or Other');
  }
  if (v('gearbox')) {
    const g = GEAR[squash(v('gearbox'))];
    if (g) row.transmission = g; else problems.push('Gearbox should be Automatic, Manual, CVT or Other');
  }
  if (v('stage')) {
    const st = STAGE[squash(v('stage'))];
    if (st) row.stage = st; else problems.push('Where is it now should be Bought, Shipping, At the port, In the bond, Cleared or At the yard');
  }
  for (const [k, field, label] of [['receivedOn', 'receivedOn', 'Date received'], ['bondArrivedOn', 'bondArrivedOn', 'Bond arrival date']] as const) {
    const d = day(v(k));
    if (d === null) problems.push(`${label} should be a date such as 2026-10-01 or 01/10/2026`);
    else if (d) row[field] = d;
  }

  const anchor = normalizeIdentifier(v('chassis'));
  if (anchor) {
    if (anchor.length < 5 || anchor.length > 30) problems.push('Chassis number or VIN looks too short or too long');
    else if (anchor.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(anchor)) row.vin = anchor;
    else row.chassisNumber = anchor;
  }
  const plate = v('plate').toUpperCase();
  if (plate) {
    if (plate.length < 2 || plate.length > 15) problems.push('Number plate looks wrong');
    else row.plate = plate;
  }

  const price = number(v('price'));
  if (price === undefined) problems.push('Asking price is missing');
  else if (!Number.isInteger(price) || price < 1 || price > 100_000_000_000) problems.push('Asking price should be a whole number in UGX');
  else row.askingPriceUgx = price;

  if (!row.make && !row.chassisNumber && !row.vin && !row.plate) problems.push('Enter the make, or the number plate or chassis number');

  const notes = v('notes');
  if (notes) { if (notes.length > 500) problems.push('Notes are longer than 500 letters'); else row.notes = notes; }

  if (withCosts) {
    const currency = (v('costCurrency') || 'UGX').toUpperCase();
    const rate = number(v('costRate'));
    let anyCost = false;
    if (!/^[A-Z]{3}$/.test(currency)) problems.push('Cost currency should be a three-letter code such as UGX or USD');
    for (const [k, label] of IMPORT_COST_CATEGORIES) {
      const amount = number(v(`cost_${k}`));
      if (amount === undefined) continue;
      anyCost = true;
      if (Number.isNaN(amount) || amount <= 0 || amount > 1e13) { problems.push(`${label} should be an amount such as 1500`); continue; }
      row.costs.push({ category: k, amount: Math.round(amount * 100) / 100, currency, ...(currency !== 'UGX' && rate ? { rateToUgx: rate } : {}) });
    }
    if (anyCost && currency !== 'UGX' && (rate === undefined || Number.isNaN(rate) || rate <= 0)) problems.push(`Rate to UGX is needed for costs in ${currency}`);
  }
  return { row, problems };
}
