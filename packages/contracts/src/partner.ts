// Partner data entry (P-005): which records each kind of source may send, and the form fields for each
// record — generated from the observation catalogue, so the screen form, the CSV upload and the API all
// apply the same rules. Simulated feeds (D-011) use exactly the same path as real partners will.
import { z } from 'zod';
import { MILES_TO_KM, OBSERVATION_TYPES, isObservationType, validateObservation, type ObservationTypeCode } from './observation-types.js';

/** Record types each source domain may submit. Garages use the Garage app; owners and community never use this console. */
export const DOMAIN_RECORD_TYPES: Partial<Record<string, ObservationTypeCode[]>> = {
  registration: ['spec_declared', 'registration_issued', 'ownership_transferred', 'plate_changed', 'identifier_assigned', 'deregistered', 'usage_declared', 'odometer_reading'],
  customs: ['import_recorded', 'customs_cleared', 'spec_declared', 'identifier_assigned'],
  police: ['stolen_reported', 'stolen_recovered', 'impounded', 'released', 'accident_reported'],
  finance: ['finance_lien_registered', 'finance_lien_discharged'],
  insurance: ['accident_reported', 'damage_assessed', 'insurance_claim', 'total_loss_declared', 'flood_damage_reported'],
  auction: ['auction_sale', 'odometer_reading', 'spec_declared'],
  rental: ['rental_period', 'usage_declared', 'odometer_reading', 'service_performed', 'repair_performed'],
  manufacturer: ['spec_declared', 'identifier_assigned'],
  dealer: ['listing_published', 'odometer_reading', 'service_performed', 'sale_recorded'],
  inspection: ['inspection_result', 'odometer_reading'],
};

export interface FieldSpec {
  /** Dotted path into the attributes, e.g. "exportMileage.value". Also the CSV column name. */
  path: string;
  label: string;
  kind: 'text' | 'number' | 'integer' | 'boolean' | 'choice' | 'list' | 'date';
  options?: string[];
  required: boolean;
}

/** Fields worked out by SAZO, never typed: km from the reading and its unit (G7). */
const COMPUTED: Partial<Record<ObservationTypeCode, { hide: string[]; fill: (a: Record<string, unknown>) => Record<string, unknown> }>> = {
  odometer_reading: {
    hide: ['km'],
    fill: (a) => (typeof a.originalValue === 'number' ? { ...a, km: Math.round(a.originalUnit === 'mi' ? a.originalValue * MILES_TO_KM : a.originalValue) } : a),
  },
};

const LABELS: Record<string, string> = {
  originalValue: 'Reading', originalUnit: 'Unit (km or mi)', method: 'How it was read', identifierType: 'Identifier type', value: 'Value',
  engineCc: 'Engine size (cc)', engineNumber: 'Engine number', originCountry: 'Country of origin (2 letters, e.g. JP)',
  'exportMileage.value': 'Mileage at export', 'exportMileage.unit': 'Unit at export', auctionGrade: 'Auction grade',
  newVehicle: 'Registered as new', oldPlate: 'Old plate', newPlate: 'New plate', claimType: 'Claim type',
  'askingPrice.amount': 'Asking price (UGX)', 'price.amount': 'Price (UGX)', structuralFindings: 'Structural damage found',
  ownerPhone: 'Registered owner phone (+256…)',
  observedColour: 'Colour seen', observedEngineNumber: 'Engine number seen', tyresPercent: 'Tyre tread left (%)', batteryOk: 'Battery OK',
};
const humanise = (path: string) => LABELS[path] ?? path.split('.').at(-1)!.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

type JsonSchema = { type?: string | string[]; enum?: unknown[]; const?: unknown; format?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; anyOf?: JsonSchema[] };

function schemaOf(type: ObservationTypeCode): JsonSchema {
  return z.toJSONSchema(OBSERVATION_TYPES[type].schema as z.ZodType, { unrepresentable: 'any', io: 'input' }) as JsonSchema;
}

/** The fields a partner fills in for one record type (objects flattened one level; party ids and constants left out). */
export function fieldsFor(type: ObservationTypeCode): FieldSpec[] {
  const hide = new Set(COMPUTED[type]?.hide ?? []);
  const out: FieldSpec[] = [];
  const walk = (s: JsonSchema, prefix: string, required: boolean) => {
    for (const [key, prop] of Object.entries(s.properties ?? {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      const req = required && (s.required ?? []).includes(key);
      if (hide.has(path) || /PartyId$/.test(key) || prop.const !== undefined) continue;
      if (prop.type === 'object' && prop.properties) { walk(prop, path, req); continue; }
      if (prop.type === 'array') {
        if (prop.items?.type === 'object') continue; // e.g. inspection defects: not entered here
        out.push({ path, label: humanise(path), kind: 'list', required: req, ...(prop.items?.enum ? { options: prop.items.enum.map(String) } : {}) });
        continue;
      }
      if (prop.enum) { out.push({ path, label: humanise(path), kind: 'choice', options: prop.enum.map(String), required: req }); continue; }
      const kind = prop.type === 'integer' ? 'integer' : prop.type === 'number' ? 'number' : prop.type === 'boolean' ? 'boolean' : prop.format === 'date' ? 'date' : 'text';
      out.push({ path, label: humanise(path), kind, required: req });
    }
  };
  walk(schemaOf(type), '', true);
  return out;
}

/** Fixed values (e.g. currency UGX) that partners never type. */
function constants(type: ObservationTypeCode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (s: JsonSchema, prefix: string) => {
    for (const [key, prop] of Object.entries(s.properties ?? {})) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (prop.const !== undefined) out[path] = prop.const;
      else if (prop.type === 'object' && prop.properties) walk(prop, path);
    }
  };
  walk(schemaOf(type), '');
  return out;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts.at(-1)!] = value;
}

export type BuildResult = { ok: true; attributes: Record<string, unknown> } | { ok: false; errors: { path: string; message: string }[] };

/**
 * Turn typed or CSV text values into a record's attributes, then validate them with the same schema the
 * API uses. Empty optional fields are left out; nested objects are only created when one of their fields is given.
 */
export function buildAttributes(type: string, flat: Record<string, string | undefined>): BuildResult {
  if (!isObservationType(type)) return { ok: false, errors: [{ path: 'type', message: `unknown record type "${type}"` }] };
  const errors: { path: string; message: string }[] = [];
  const attrs: Record<string, unknown> = {};
  const groups = new Set<string>();
  for (const f of fieldsFor(type)) {
    const raw = flat[f.path]?.trim();
    if (!raw) { if (f.required) errors.push({ path: f.path, message: `${f.label} is required` }); continue; }
    let v: unknown = raw;
    if (f.kind === 'number' || f.kind === 'integer') {
      const n = Number(raw.replace(/[,\s]/g, ''));
      if (!Number.isFinite(n) || (f.kind === 'integer' && !Number.isInteger(n))) { errors.push({ path: f.path, message: `${f.label} must be a ${f.kind === 'integer' ? 'whole ' : ''}number` }); continue; }
      v = n;
    } else if (f.kind === 'boolean') {
      const b = raw.toLowerCase();
      if (!['yes', 'no', 'true', 'false', '1', '0'].includes(b)) { errors.push({ path: f.path, message: `${f.label}: use yes or no` }); continue; }
      v = ['yes', 'true', '1'].includes(b);
    } else if (f.kind === 'list') {
      v = raw.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
    } else if (f.kind === 'choice' && f.options && !f.options.includes(raw)) {
      errors.push({ path: f.path, message: `${f.label}: use one of ${f.options.join(', ')}` }); continue;
    }
    setPath(attrs, f.path, v);
    if (f.path.includes('.')) groups.add(f.path.split('.')[0]!);
  }
  for (const [path, value] of Object.entries(constants(type))) {
    if (!path.includes('.') || groups.has(path.split('.')[0]!) || fieldsFor(type).every((f) => !f.path.startsWith(`${path.split('.')[0]}.`))) setPath(attrs, path, value);
  }
  if (errors.length) return { ok: false, errors };
  const filled = COMPUTED[type]?.fill(attrs) ?? attrs;
  const v = validateObservation(type, filled);
  return v.ok ? { ok: true, attributes: v.attributes } : { ok: false, errors: v.errors };
}

/** CSV columns for a source domain: identifiers, record type, date, then every field of every allowed record type. */
export function csvColumns(domain: string): string[] {
  const fields = new Set<string>();
  for (const t of DOMAIN_RECORD_TYPES[domain] ?? []) for (const f of fieldsFor(t)) fields.add(f.path);
  return ['vin', 'chassis_number', 'plate', 'record_type', 'date', ...fields];
}
