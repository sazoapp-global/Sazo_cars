// Garage job → the observations SAZO stores (D-054). The form itself is shared: @sazo/contracts (garage-job.ts).
import { MILES_TO_KM, type JobForm, type WorkType } from '@sazo/contracts';

export { DraftInput, JobForm, WORK_TYPES, completenessErrors, evidenceRefs, workPhrase, type FieldError, type WorkType } from '@sazo/contracts';

export interface JobRecord {
  type: string;
  attributes: Record<string, unknown>;
  time: { at: string; precision: 'exact' };
  evidenceIds?: string[];
}

const OTHER_WORK: Partial<Record<WorkType, string>> = { transmission: 'transmission', electrical: 'electrical', inspection: 'inspection', other: 'other' };

/** Turn a complete job into the records Ingestion stores (one garage visit = one event). */
export function jobRecords(workTypes: readonly WorkType[], f: JobForm, at: string, extraEvidence: string[]): JobRecord[] {
  const time = { at, precision: 'exact' as const };
  const out: JobRecord[] = [];
  const m = f.mileage!;
  const km = m.unit === 'mi' ? Math.round(m.value * MILES_TO_KM) : m.value;
  // Extra photos (plate photo, part photos) ride along on the odometer record so they are linked to the visit.
  out.push({ type: 'odometer_reading', attributes: { km, originalValue: m.value, originalUnit: m.unit, method: 'dashboard' }, time,
    evidenceIds: [m.odometerPhotoId!, ...extraEvidence] });

  if (workTypes.includes('service') && f.service) out.push({ type: 'service_performed', attributes: { items: f.service.items }, time });
  if (workTypes.includes('engine') && f.engine?.replaced) {
    out.push({ type: 'component_replaced', time, evidenceIds: [f.engine.newEngineNumberPhotoId!], attributes: {
      component: 'engine', newSerial: f.engine.newEngineNumber,
      ...(f.engine.oldEngineNumber ? { oldSerial: f.engine.oldEngineNumber } : {}),
      ...(f.engine.reason || f.engine.engineSource ? { reason: [f.engine.engineSource, f.engine.reason].filter(Boolean).join(': ') } : {}),
    } });
  }
  if (workTypes.includes('body_paint') && f.bodyPaint) {
    out.push({ type: 'paint_work', time, attributes: {
      areas: f.bodyPaint.areas, reason: f.bodyPaint.reason,
      ...(f.bodyPaint.oldColour ? { oldColour: f.bodyPaint.oldColour } : {}), ...(f.bodyPaint.newColour ? { newColour: f.bodyPaint.newColour } : {}),
    } });
  }
  const components = [
    ...((workTypes.includes('repair') || workTypes.includes('accident_damage')) && f.repair ? f.repair.components : []),
    ...workTypes.map((w) => OTHER_WORK[w]).filter((c): c is string => !!c && !(f.repair?.components ?? []).includes(c)),
  ];
  if (components.length) {
    out.push({ type: 'repair_performed', time, attributes: {
      components, ...(f.repair?.structural !== undefined ? { structural: f.repair.structural } : {}),
      ...(f.repair?.description ? { description: f.repair.description } : {}),
    } });
  }
  if (workTypes.includes('accident_damage')) out.push({ type: 'accident_reported', time, attributes: {} });
  if (f.cost) {
    out.push({ type: 'cost_recorded', time, attributes: { amount: f.cost.total.amount, currency: 'UGX' },
      ...(f.cost.receiptPhotoId ? { evidenceIds: [f.cost.receiptPhotoId] } : {}) });
  }
  return out;
}

