import { describe, expect, it } from 'vitest';
import {
  chassisModelCode,
  classifyIdentifier,
  normalizeIdentifier,
  requiredEvidenceFor,
  validateObservation,
} from './index.js';

describe('identifiers', () => {
  it('normalises spaces, dashes and case', () => {
    expect(normalizeIdentifier(' ubk 482m ')).toBe('UBK482M');
    expect(normalizeIdentifier('ZSU60-0071234')).toBe('ZSU600071234');
  });

  it('classifies VINs, Japanese chassis numbers and Ugandan plates', () => {
    expect(classifyIdentifier('WDD2050042F123456').kind).toBe('vin');
    expect(classifyIdentifier('ZSU60-0071234').kind).toBe('chassis');
    expect(classifyIdentifier('NZT260-3048271').kind).toBe('chassis');
    expect(classifyIdentifier('GP3-0123456').kind).toBe('chassis');
    expect(classifyIdentifier('UBK 482M').kind).toBe('plate');
    expect(classifyIdentifier('hello').kind).toBe('unknown');
  });

  it('suggests a corrected VIN when O/I/Q were typed (S26, G9)', () => {
    const r = classifyIdentifier('WDD2O5OO42F123456');
    expect(r.kind).toBe('vin');
    expect(r.suggestion).toBe('WDD2050042F123456');
  });

  it('suggests a corrected chassis number typed with O for 0', () => {
    expect(classifyIdentifier('ZSU60-OO71234').suggestion).toBe('ZSU600071234');
  });

  it('extracts the model code from a chassis number', () => {
    expect(chassisModelCode('ZSU60-0071234')).toBe('ZSU60');
    expect(chassisModelCode('NZT260-3048271')).toBe('NZT260');
  });
});

describe('observation catalogue', () => {
  it('accepts a valid odometer reading and converts miles (G7)', () => {
    expect(validateObservation('odometer_reading', { km: 74030, originalValue: 46000, originalUnit: 'mi' }).ok).toBe(true);
    expect(validateObservation('odometer_reading', { km: 46000, originalValue: 46000, originalUnit: 'mi' }).ok).toBe(false);
  });

  it('rejects unknown types', () => {
    const r = validateObservation('made_up', {});
    expect(r.ok).toBe(false);
  });

  it('requires the new engine number for an engine replacement', () => {
    expect(validateObservation('component_replaced', { component: 'engine', oldSerial: '1NZ-A111111' }).ok).toBe(false);
    expect(validateObservation('component_replaced', { component: 'engine', newSerial: '1NZ-B222222' }).ok).toBe(true);
  });

  it('requires readings before/after for an instrument cluster swap (G1)', () => {
    expect(validateObservation('component_replaced', { component: 'instrument_cluster' }).ok).toBe(false);
    expect(validateObservation('component_replaced', { component: 'instrument_cluster', readingBefore: 141200, readingAfter: 12 }).ok).toBe(true);
  });

  it('requires a reason for plate changes (G6)', () => {
    expect(validateObservation('plate_changed', { oldPlate: 'UAR 902C', newPlate: 'UBQ 330D' }).ok).toBe(false);
    expect(validateObservation('plate_changed', { oldPlate: 'UAR 902C', newPlate: 'UBQ 330D', reason: 'replacement' }).ok).toBe(true);
  });

  it('knows which photos a garage must attach (D-057)', () => {
    expect(requiredEvidenceFor('odometer_reading', { km: 1, originalValue: 1, originalUnit: 'km' })).toEqual(['odometer_photo']);
    expect(requiredEvidenceFor('component_replaced', { component: 'engine', newSerial: 'X' })).toEqual(['engine_number_photo']);
    expect(requiredEvidenceFor('service_performed', { items: ['oil'] })).toEqual([]);
  });
});
