import { validateObservation } from '@sazo/contracts';
import { describe, expect, it } from 'vitest';
import { inspectionErrors, inspectionRecords } from './inspection-records.js';

const id = (n: number) => `0192a000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const complete = {
  mileage: { value: 50000, unit: 'mi' as const, odometerPhotoId: id(1) },
  identity: { colourSeen: 'white', engineNumberSeen: '2AR-1234567' },
  paint: { readings: [{ panel: 'bonnet' as const, microns: 320 }] },
  structure: { damageFound: true, areas: ['chassis_rails' as const], severity: 'moderate' as const },
  tyres: { minTreadPercent: 40 }, battery: { ok: false },
  defects: [{ item: 'Front brake pads worn', severity: 'major' as const }],
  result: { passed: false },
  photoIds: [id(2), id(3)],
};

describe('inspection checklist', () => {
  it('lists what is missing', () => {
    expect(inspectionErrors({}).map((e) => e.path)).toEqual(['form.mileage', 'form.mileage.odometerPhotoId', 'form.structure', 'form.photoIds', 'form.result']);
    expect(inspectionErrors({ ...complete, structure: { damageFound: true, areas: [] } }).map((e) => e.path)).toEqual(['form.structure.areas', 'form.structure.severity']);
    expect(inspectionErrors({ ...complete, identity: { chassisSeen: 'ZSU60-0071234' } }).map((e) => e.path)).toEqual(['form.identity.chassisPhotoId']);
    expect(inspectionErrors(complete)).toEqual([]);
  });

  it('becomes valid records: mileage in km, the result with paint readings, and structural damage', () => {
    const recs = inspectionRecords(complete, '2026-10-08T09:00:00Z', id(9));
    expect(recs.map((r) => r.type)).toEqual(['odometer_reading', 'inspection_result', 'damage_assessed']);
    for (const r of recs) expect(validateObservation(r.type, r.attributes).ok).toBe(true);
    expect(recs[0]!.attributes.km).toBe(80467);
    expect(recs[1]!.evidenceIds).toEqual([id(9), id(2), id(3)]);
    expect(recs[1]!.attributes).toMatchObject({ passed: false, structuralFindings: true, tyresPercent: 40, batteryOk: false, observedColour: 'white' });
  });

  it('no structural damage → no damage record', () => {
    const recs = inspectionRecords({ ...complete, structure: { damageFound: false, areas: [] } }, '2026-10-08T09:00:00Z', id(9));
    expect(recs.map((r) => r.type)).toEqual(['odometer_reading', 'inspection_result']);
  });
});
