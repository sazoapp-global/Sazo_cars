// The observation type catalogue (Domain Model §4, DM-3). Each type has a versioned attribute schema,
// a default sensitivity and the evidence a garage must attach (D-057). The same definitions are seeded
// into obs.observation_types so the database and the code agree.
import { z } from 'zod';
import type { EvidenceKind, Sensitivity, SourceDomain } from './enums.js';
import { USAGE_TYPES } from './enums.js';

const km = z.number().int().nonnegative();
const money = z.object({ amount: z.number().int().nonnegative(), currency: z.literal('UGX') });
const distance = z.object({ value: z.number().nonnegative(), unit: z.enum(['km', 'mi']) });
const colour = z.string().min(2).max(40);
const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'use international format, e.g. +256772123456');

export const MILES_TO_KM = 1.609344;

export interface ObservationTypeDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  code: string;
  schemaVersion: number;
  domain: SourceDomain | 'identity' | 'mileage' | 'maintenance' | 'damage' | 'legal' | 'market' | 'cost' | 'usage';
  schema: S;
  defaultSensitivity: Sensitivity;
  /** Evidence a garage/inspector submission must include for this observation (D-057). */
  requiredEvidence: (attrs: z.infer<S>) => EvidenceKind[];
}

function def<S extends z.ZodTypeAny>(
  code: string,
  domain: ObservationTypeDef['domain'],
  schema: S,
  defaultSensitivity: Sensitivity = 'public',
  requiredEvidence: (attrs: z.infer<S>) => EvidenceKind[] = () => [],
): ObservationTypeDef<S> {
  return { code, schemaVersion: 1, domain, schema, defaultSensitivity, requiredEvidence };
}

export const OBSERVATION_TYPES = {
  // Identity & spec
  identifier_assigned: def('identifier_assigned', 'identity', z.object({
    identifierType: z.enum(['vin', 'chassis_number', 'registration_plate', 'engine_number', 'import_reference']),
    value: z.string().min(2),
  })),
  spec_declared: def('spec_declared', 'identity', z.object({
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().min(1950).max(2100).optional(),
    body: z.string().optional(),
    engineCc: z.number().int().positive().optional(),
    fuel: z.enum(['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other']).optional(),
    transmission: z.enum(['manual', 'automatic', 'cvt', 'other']).optional(),
    colour: colour.optional(),
    engineNumber: z.string().optional(),
  })),

  // Import & registration
  import_recorded: def('import_recorded', 'customs', z.object({
    originCountry: z.string().length(2),
    port: z.string().optional(),
    exportMileage: distance.optional(),
    auctionGrade: z.string().optional(),
  })),
  customs_cleared: def('customs_cleared', 'customs', z.object({}).passthrough()),
  registration_issued: def('registration_issued', 'registration', z.object({
    plate: z.string().min(4),
    newVehicle: z.boolean().optional(),
    ownerPartyId: z.string().uuid().optional(),
    /** Accepted at intake only: SAZO moves it to the private personal-data store and keeps ownerPartyId (DM-2). */
    ownerPhone: phone.optional(),
  })),
  plate_changed: def('plate_changed', 'registration', z.object({
    oldPlate: z.string().min(4),
    newPlate: z.string().min(4),
    reason: z.enum(['replacement', 're_registration', 'personalised', 'correction']), // G6
  })),
  deregistered: def('deregistered', 'registration', z.object({ reason: z.enum(['export', 'scrap', 'other']) })),

  // Ownership & use
  ownership_transferred: def('ownership_transferred', 'registration', z.object({
    fromPartyId: z.string().uuid().optional(),
    toPartyId: z.string().uuid().optional(),
    /** Accepted at intake only: replaced by toPartyId before storage (DM-2). */
    ownerPhone: phone.optional(),
  }).refine((a) => a.toPartyId || a.ownerPhone, { message: 'the new owner is required (phone number)' }), 'confidential'),
  usage_declared: def('usage_declared', 'usage', z.object({ usage: z.enum(USAGE_TYPES) })),
  rental_period: def('rental_period', 'rental', z.object({
    from: z.string().date(),
    to: z.string().date().optional(),
  })),

  // Mileage
  odometer_reading: def('odometer_reading', 'mileage', z.object({
    km,
    originalValue: z.number().nonnegative(),
    originalUnit: z.enum(['km', 'mi']), // G7
    method: z.enum(['dashboard', 'ecu', 'document', 'estimated']).optional(),
  }).refine(
    (a) => Math.abs((a.originalUnit === 'mi' ? a.originalValue * MILES_TO_KM : a.originalValue) - a.km) <= 1,
    { message: 'km must equal the original reading converted to km' },
  ), 'public', () => ['odometer_photo']),

  // Maintenance
  service_performed: def('service_performed', 'maintenance', z.object({
    items: z.array(z.string()).min(1),
  })),
  component_replaced: def('component_replaced', 'maintenance', z.object({
    component: z.enum(['engine', 'transmission', 'instrument_cluster', 'other']),
    oldSerial: z.string().optional(),
    newSerial: z.string().optional(),
    readingBefore: km.optional(), // G1: instrument cluster
    readingAfter: km.optional(),
    reason: z.string().optional(),
  }).refine((a) => a.component !== 'engine' || !!a.newSerial, { message: 'engine replacement needs the new engine number' })
    .refine((a) => a.component !== 'instrument_cluster' || (a.readingBefore !== undefined && a.readingAfter !== undefined),
      { message: 'instrument cluster replacement needs readings before and after' }),
  'public', (a) => (a.component === 'engine' ? ['engine_number_photo'] : a.component === 'instrument_cluster' ? ['odometer_photo'] : [])),
  repair_performed: def('repair_performed', 'maintenance', z.object({
    components: z.array(z.string()).min(1),
    structural: z.boolean().optional(),
    description: z.string().optional(),
  })),
  paint_work: def('paint_work', 'maintenance', z.object({
    areas: z.array(z.enum(['full_body', 'front', 'rear', 'left', 'right', 'roof', 'bonnet', 'other'])).min(1),
    oldColour: colour.optional(),
    newColour: colour.optional(),
    reason: z.enum(['accident', 'cosmetic', 'rust', 'other']),
  })),

  // Damage & safety
  accident_reported: def('accident_reported', 'damage', z.object({
    severity: z.enum(['minor', 'moderate', 'severe']).optional(),
    location: z.string().optional(),
  })),
  damage_assessed: def('damage_assessed', 'damage', z.object({
    areas: z.array(z.string()).min(1),
    severity: z.enum(['minor', 'moderate', 'severe']),
    structural: z.boolean(),
  })),
  insurance_claim: def('insurance_claim', 'insurance', z.object({ claimType: z.string().optional() }), 'restricted'),
  total_loss_declared: def('total_loss_declared', 'insurance', z.object({}).passthrough()),
  flood_damage_reported: def('flood_damage_reported', 'insurance', z.object({}).passthrough()),

  // Legal & finance
  stolen_reported: def('stolen_reported', 'police', z.object({}).passthrough(), 'restricted'),
  stolen_recovered: def('stolen_recovered', 'police', z.object({}).passthrough(), 'restricted'),
  impounded: def('impounded', 'police', z.object({}).passthrough(), 'restricted'),
  released: def('released', 'police', z.object({}).passthrough(), 'restricted'),
  finance_lien_registered: def('finance_lien_registered', 'finance', z.object({
    lenderPartyId: z.string().uuid().optional(),
  }), 'restricted'),
  finance_lien_discharged: def('finance_lien_discharged', 'finance', z.object({}).passthrough(), 'restricted'),

  // Inspection
  inspection_result: def('inspection_result', 'inspection', z.object({
    passed: z.boolean(),
    observedColour: colour.optional(),
    observedEngineNumber: z.string().optional(),
    structuralFindings: z.boolean().optional(),
    tyresPercent: z.number().min(0).max(100).optional(),
    batteryOk: z.boolean().optional(),
    defects: z.array(z.object({ item: z.string(), severity: z.enum(['minor', 'major']) })).optional(),
  }), 'public', () => ['inspection_report']),

  // Market
  listing_published: def('listing_published', 'market', z.object({ askingPrice: money })),
  sale_recorded: def('sale_recorded', 'market', z.object({ price: money }), 'confidential'),
  auction_sale: def('auction_sale', 'auction', z.object({
    auctionGrade: z.string().optional(),
    exportMileage: distance.optional(),
    price: money.optional(),
  })),

  // Cost
  cost_recorded: def('cost_recorded', 'cost', money, 'confidential'),
} as const;

export type ObservationTypeCode = keyof typeof OBSERVATION_TYPES;
export type ObservationAttributes<T extends ObservationTypeCode> = z.infer<(typeof OBSERVATION_TYPES)[T]['schema']>;

export function isObservationType(code: string): code is ObservationTypeCode {
  return Object.prototype.hasOwnProperty.call(OBSERVATION_TYPES, code);
}

export type ValidationResult =
  | { ok: true; attributes: Record<string, unknown> }
  | { ok: false; errors: { path: string; message: string }[] };

/** Validate attributes for an observation type. Unknown types are rejected. */
export function validateObservation(type: string, attributes: unknown): ValidationResult {
  if (!isObservationType(type)) return { ok: false, errors: [{ path: 'type', message: `unknown observation type "${type}"` }] };
  const parsed = OBSERVATION_TYPES[type].schema.safeParse(attributes);
  if (parsed.success) return { ok: true, attributes: parsed.data as Record<string, unknown> };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({ path: i.path.join('.') || 'attributes', message: i.message })),
  };
}

/** Evidence kinds a garage must attach for this observation (D-057). */
export function requiredEvidenceFor(type: ObservationTypeCode, attributes: unknown): EvidenceKind[] {
  const t = OBSERVATION_TYPES[type] as ObservationTypeDef;
  return t.requiredEvidence(attributes as never);
}
