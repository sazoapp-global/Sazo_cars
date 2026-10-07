// The garage job form (D-052, D-054, D-057), shared by the API and the garage phone app so both apply
// exactly the same rules — the phone can say what's missing even when it's offline.
import { z } from 'zod';

export const WORK_TYPES = ['service', 'repair', 'accident_damage', 'body_paint', 'engine', 'transmission', 'electrical', 'inspection', 'other'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

const Uuid = z.string().uuid();
const Money = z.object({ amount: z.number().int().nonnegative().max(10_000_000_000), currency: z.literal('UGX') });
const Phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, e.g. +256772123456');
const text = (max: number) => z.string().trim().max(max);

export const JobForm = z.object({
  mileage: z.object({
    value: z.number().int().min(0).max(2_000_000),
    unit: z.enum(['km', 'mi']).default('km'),
    odometerPhotoId: Uuid.optional(),
  }).optional(),
  service: z.object({ items: z.array(text(80).min(1)).max(40) }).optional(),
  engine: z.object({
    replaced: z.boolean(),
    oldEngineNumber: text(40).optional(),
    oldMatchedRecord: z.boolean().optional(),
    newEngineNumber: text(40).optional(),
    newEngineNumberPhotoId: Uuid.optional(),
    engineSource: z.enum(['new', 'used_import', 'used_local', 'rebuilt']).optional(),
    reason: text(500).optional(),
  }).optional(),
  bodyPaint: z.object({
    areas: z.array(z.enum(['full_body', 'front', 'rear', 'left', 'right', 'roof', 'bonnet', 'other'])).max(8),
    oldColour: text(40).optional(),
    newColour: text(40).optional(),
    reason: z.enum(['accident', 'cosmetic', 'rust', 'other']).optional(),
  }).optional(),
  repair: z.object({
    components: z.array(text(80).min(1)).max(40),
    structural: z.boolean().optional(),
    description: text(2000).optional(),
  }).optional(),
  customer: z.object({ name: text(120).optional(), phone: Phone.optional(), smsConsent: z.boolean().optional() }).optional(),
  cost: z.object({
    total: Money,
    paid: Money.optional(),
    method: z.enum(['cash', 'mtn_momo', 'airtel_money', 'bank', 'other']).optional(),
    receiptPhotoId: Uuid.optional(),
  }).optional(),
  notes: text(2000).optional(),
  /** Other photos (e.g. the plate photo for a car new to SAZO, part photos). */
  evidenceIds: z.array(Uuid).max(20).optional(),
});
export type JobForm = z.infer<typeof JobForm>;

export const DraftInput = z.object({
  plateEntered: z.string().trim().min(2).max(15),
  vehicleRef: z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/).optional(),
  workTypes: z.array(z.enum(WORK_TYPES)).min(1).max(WORK_TYPES.length),
  clientCreatedAt: z.string().datetime({ offset: true }),
  form: JobForm,
  version: z.number().int().positive().optional(),
});
export type DraftInput = z.infer<typeof DraftInput>;

export interface FieldError { path: string; code: string; message: string }

/** What must be filled in before a job can be submitted — only the steps for the chosen work (D-052, D-054, D-057). */
export function completenessErrors(workTypes: readonly WorkType[], f: JobForm): FieldError[] {
  const e: FieldError[] = [];
  const need = (cond: unknown, path: string, message: string, code = 'required') => {
    if (!cond) e.push({ path, code, message });
  };
  need(f.mileage, 'form.mileage', 'Enter the mileage shown on the dashboard');
  need(f.mileage?.odometerPhotoId, 'form.mileage.odometerPhotoId', 'Take a photo of the odometer', 'evidence_required');
  if (workTypes.includes('service')) need(f.service?.items.length, 'form.service.items', 'What was done in the service?');
  if (workTypes.includes('engine')) {
    need(f.engine, 'form.engine', 'Was the engine replaced?');
    if (f.engine?.replaced) {
      need(f.engine.newEngineNumber, 'form.engine.newEngineNumber', 'Enter the new engine number');
      need(f.engine.newEngineNumberPhotoId, 'form.engine.newEngineNumberPhotoId', 'Take a photo of the new engine number', 'evidence_required');
    }
  }
  if (workTypes.includes('body_paint')) {
    need(f.bodyPaint?.areas.length, 'form.bodyPaint.areas', 'Which parts were painted?');
    need(f.bodyPaint?.reason, 'form.bodyPaint.reason', 'Why was it painted?');
  }
  if (workTypes.includes('repair') || workTypes.includes('accident_damage')) {
    need(f.repair?.components.length, 'form.repair.components', 'Which parts were repaired?');
  }
  return e;
}

/** Every evidence id a job refers to, with the kind it must be. */
export function evidenceRefs(f: JobForm): { id: string; kind?: string; path: string }[] {
  return [
    ...(f.mileage?.odometerPhotoId ? [{ id: f.mileage.odometerPhotoId, kind: 'odometer_photo', path: 'form.mileage.odometerPhotoId' }] : []),
    ...(f.engine?.newEngineNumberPhotoId ? [{ id: f.engine.newEngineNumberPhotoId, kind: 'engine_number_photo', path: 'form.engine.newEngineNumberPhotoId' }] : []),
    ...(f.cost?.receiptPhotoId ? [{ id: f.cost.receiptPhotoId, path: 'form.cost.receiptPhotoId' }] : []),
    ...(f.evidenceIds ?? []).map((id, i) => ({ id, path: `form.evidenceIds[${i}]` })),
  ];
}

/** A short phrase for the owner SMS, e.g. "a service and engine work". */
export function workPhrase(workTypes: readonly WorkType[]): string {
  const words: Record<WorkType, string> = {
    service: 'a service', repair: 'a repair', accident_damage: 'accident repairs', body_paint: 'paint work', engine: 'engine work',
    transmission: 'gearbox work', electrical: 'electrical work', inspection: 'an inspection', other: 'work',
  };
  const list = workTypes.map((w) => words[w]);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]!;
}
