// An inspection → the observations SAZO stores (P-004). The checklist itself is shared: @sazo/contracts (inspection-form.ts).
import { MILES_TO_KM, type InspectionForm } from '@sazo/contracts';

export { InspectionDraftInput, InspectionForm, inspectionErrors, inspectionEvidenceRefs, repaintedPanels, type InspectionFieldError } from '@sazo/contracts';

export interface InspectionRecord {
  type: string;
  attributes: Record<string, unknown>;
  time: { at: string; precision: 'exact' };
  evidenceIds?: string[];
}

export const kmOf = (m: NonNullable<InspectionForm['mileage']>) => (m.unit === 'mi' ? Math.round(m.value * MILES_TO_KM) : m.value);

/** Turn a complete inspection into records (one inspection = one event). `reportId` is the checklist file SAZO wrote. */
export function inspectionRecords(f: InspectionForm, at: string, reportId: string): InspectionRecord[] {
  const time = { at, precision: 'exact' as const };
  const m = f.mileage!;
  const out: InspectionRecord[] = [
    { type: 'odometer_reading', time, evidenceIds: [m.odometerPhotoId!], attributes: { km: kmOf(m), originalValue: m.value, originalUnit: m.unit, method: 'dashboard' } },
  ];
  const defects = f.defects ?? [];
  const readings = f.paint?.readings ?? [];
  out.push({
    type: 'inspection_result', time,
    evidenceIds: [reportId, ...(f.identity?.chassisPhotoId ? [f.identity.chassisPhotoId] : []), ...(f.photoIds ?? [])],
    attributes: {
      passed: f.result!.passed,
      structuralFindings: f.structure!.damageFound,
      ...(f.identity?.colourSeen ? { observedColour: f.identity.colourSeen } : {}),
      ...(f.identity?.engineNumberSeen ? { observedEngineNumber: f.identity.engineNumberSeen } : {}),
      ...(f.tyres ? { tyresPercent: f.tyres.minTreadPercent } : {}),
      ...(f.battery ? { batteryOk: f.battery.ok } : {}),
      ...(defects.length ? { defects } : {}),
      ...(readings.length ? { paintReadings: readings } : {}),
    },
  });
  // Structural damage seen by an inspector is a damage record in its own right (Rule Set §7, damage question).
  if (f.structure!.damageFound) {
    out.push({ type: 'damage_assessed', time, attributes: { areas: f.structure!.areas, severity: f.structure!.severity, structural: true } });
  }
  return out;
}
