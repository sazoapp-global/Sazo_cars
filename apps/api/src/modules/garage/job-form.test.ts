import { validateObservation } from '@sazo/contracts';
import { describe, expect, it } from 'vitest';
import { completenessErrors, jobRecords, workPhrase, type JobForm } from './job-form.js';

const PHOTO = '0192a000-0000-7000-8000-000000000001';
const at = '2026-10-01T09:00:00.000Z';

describe('garage job → records (D-052, D-054)', () => {
  it('maps every step to a valid observation, converting miles to km (G7)', () => {
    const form: JobForm = {
      mileage: { value: 50000, unit: 'mi', odometerPhotoId: PHOTO },
      bodyPaint: { areas: ['front', 'bonnet'], oldColour: 'Silver', newColour: 'Black', reason: 'accident' },
      repair: { components: ['bumper'], structural: false },
      cost: { total: { amount: 1_200_000, currency: 'UGX' } },
    };
    const records = jobRecords(['accident_damage', 'body_paint', 'electrical'], form, at, []);
    expect(records.map((r) => r.type)).toEqual(['odometer_reading', 'paint_work', 'repair_performed', 'accident_reported', 'cost_recorded']);
    expect(records[0]!.attributes).toMatchObject({ km: 80467, originalValue: 50000, originalUnit: 'mi' });
    expect(records[2]!.attributes.components).toEqual(['bumper', 'electrical']);
    for (const r of records) expect(validateObservation(r.type, r.attributes).ok).toBe(true);
  });

  it('asks only for the steps of the chosen work, plus mileage and its photo', () => {
    expect(completenessErrors(['service'], {}).map((e) => e.path)).toEqual(['form.mileage', 'form.mileage.odometerPhotoId', 'form.service.items']);
    expect(completenessErrors(['engine'], { mileage: { value: 1, unit: 'km', odometerPhotoId: PHOTO }, engine: { replaced: false } })).toEqual([]);
  });

  it('describes the work in plain words for the SMS', () => {
    expect(workPhrase(['service'])).toBe('a service');
    expect(workPhrase(['service', 'engine', 'body_paint'])).toBe('a service, engine work and paint work');
  });
});
