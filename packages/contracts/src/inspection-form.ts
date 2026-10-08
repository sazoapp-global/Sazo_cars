// The inspection checklist (P-004), shared by the API and the phone app so both apply exactly the same
// rules — the inspector can see what's missing even with no signal. An inspection records what a trained
// person saw on the car on one day: identity, mileage, paint thickness, structure, tyres, battery, defects.
import { z } from 'zod';

/** Steel panels a paint-thickness gauge can read (bumpers are plastic and are left out). */
export const PANELS = [
  'bonnet', 'roof', 'boot', 'front_left_wing', 'front_right_wing', 'front_left_door', 'front_right_door',
  'rear_left_door', 'rear_right_door', 'rear_left_quarter', 'rear_right_quarter',
] as const;
export type Panel = (typeof PANELS)[number];
export const PANEL_LABELS: Record<Panel, string> = {
  bonnet: 'Bonnet', roof: 'Roof', boot: 'Boot lid', front_left_wing: 'Front left wing', front_right_wing: 'Front right wing',
  front_left_door: 'Front left door', front_right_door: 'Front right door', rear_left_door: 'Rear left door', rear_right_door: 'Rear right door',
  rear_left_quarter: 'Rear left quarter panel', rear_right_quarter: 'Rear right quarter panel',
};
/** Factory paint is usually 80–180 microns; above this a panel has very likely been repainted (Rule Set v1.1). */
export const REPAINT_MICRONS = 250;

export const STRUCTURE_AREAS = ['chassis_rails', 'pillars', 'floor', 'roof_frame', 'radiator_support', 'boot_floor', 'suspension_mounts', 'other'] as const;
export type StructureArea = (typeof STRUCTURE_AREAS)[number];
export const STRUCTURE_LABELS: Record<StructureArea, string> = {
  chassis_rails: 'Chassis rails', pillars: 'Pillars (A/B/C)', floor: 'Floor', roof_frame: 'Roof frame', radiator_support: 'Radiator support',
  boot_floor: 'Boot floor', suspension_mounts: 'Suspension mounts', other: 'Other',
};

const Uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);

export const InspectionForm = z.object({
  mileage: z.object({
    value: z.number().int().min(0).max(2_000_000),
    unit: z.enum(['km', 'mi']).default('km'),
    odometerPhotoId: Uuid.optional(),
  }).optional(),
  identity: z.object({
    /** VIN or chassis number as stamped on the car. Checked against SAZO's records. */
    chassisSeen: text(30).optional(),
    chassisPhotoId: Uuid.optional(),
    colourSeen: text(40).optional(),
    engineNumberSeen: text(40).optional(),
  }).optional(),
  paint: z.object({
    readings: z.array(z.object({ panel: z.enum(PANELS), microns: z.number().int().min(0).max(3000) })).max(PANELS.length),
  }).optional(),
  structure: z.object({
    damageFound: z.boolean(),
    areas: z.array(z.enum(STRUCTURE_AREAS)).max(STRUCTURE_AREAS.length).default([]),
    severity: z.enum(['minor', 'moderate', 'severe']).optional(),
  }).optional(),
  tyres: z.object({ minTreadPercent: z.number().int().min(0).max(100) }).optional(),
  battery: z.object({ ok: z.boolean() }).optional(),
  defects: z.array(z.object({ item: text(80).min(1), severity: z.enum(['minor', 'major']) })).max(30).optional(),
  result: z.object({ passed: z.boolean(), summary: text(1000).optional() }).optional(),
  /** Photos of the car (front, back, sides, damage). */
  photoIds: z.array(Uuid).max(20).optional(),
});
export type InspectionForm = z.infer<typeof InspectionForm>;

export const InspectionDraftInput = z.object({
  plateEntered: z.string().trim().min(2).max(15),
  vehicleRef: z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/).optional(),
  clientCreatedAt: z.string().datetime({ offset: true }),
  form: InspectionForm,
  version: z.number().int().positive().optional(),
});
export type InspectionDraftInput = z.infer<typeof InspectionDraftInput>;

export const MIN_INSPECTION_PHOTOS = 2;

export interface InspectionFieldError { path: string; code: string; message: string }

/** What must be filled in before an inspection can be sent. */
export function inspectionErrors(f: InspectionForm): InspectionFieldError[] {
  const e: InspectionFieldError[] = [];
  const need = (cond: unknown, path: string, message: string, code = 'required') => { if (!cond) e.push({ path, code, message }); };
  need(f.mileage, 'form.mileage', 'Enter the mileage shown on the dashboard');
  need(f.mileage?.odometerPhotoId, 'form.mileage.odometerPhotoId', 'Take a photo of the odometer', 'evidence_required');
  need(f.structure, 'form.structure', 'Did you find structural damage?');
  if (f.structure?.damageFound) {
    need(f.structure.areas.length, 'form.structure.areas', 'Where is the structural damage?');
    need(f.structure.severity, 'form.structure.severity', 'How bad is the structural damage?');
  }
  if (f.identity?.chassisSeen) need(f.identity.chassisPhotoId, 'form.identity.chassisPhotoId', 'Take a photo of the chassis number', 'evidence_required');
  need((f.photoIds?.length ?? 0) >= MIN_INSPECTION_PHOTOS, 'form.photoIds', `Take at least ${MIN_INSPECTION_PHOTOS} photos of the car`, 'evidence_required');
  need(f.result, 'form.result', 'Did the car pass the inspection?');
  return e;
}

/** Panels whose paint is thick enough to suggest a repaint. */
export function repaintedPanels(readings: readonly { panel: string; microns: number }[] | undefined): string[] {
  return (readings ?? []).filter((r) => r.microns > REPAINT_MICRONS).map((r) => r.panel);
}

/** Every photo an inspection refers to, with the kind it must be. */
export function inspectionEvidenceRefs(f: InspectionForm): { id: string; kind?: string; path: string }[] {
  return [
    ...(f.mileage?.odometerPhotoId ? [{ id: f.mileage.odometerPhotoId, kind: 'odometer_photo', path: 'form.mileage.odometerPhotoId' }] : []),
    ...(f.identity?.chassisPhotoId ? [{ id: f.identity.chassisPhotoId, kind: 'vehicle_photo', path: 'form.identity.chassisPhotoId' }] : []),
    ...(f.photoIds ?? []).map((id, i) => ({ id, kind: 'vehicle_photo', path: `form.photoIds[${i}]` })),
  ];
}
