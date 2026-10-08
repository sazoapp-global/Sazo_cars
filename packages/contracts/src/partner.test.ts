import { describe, expect, it } from 'vitest';
import { DOMAIN_RECORD_TYPES, buildAttributes, buyerVisibleAttributes, csvColumns, fieldsFor } from './partner.js';

describe('partner data entry', () => {
  it('every record type in every domain has a form', () => {
    for (const types of Object.values(DOMAIN_RECORD_TYPES)) for (const t of types!) expect(Array.isArray(fieldsFor(t))).toBe(true);
  });

  it('works out km from a reading in miles (G7) — km is never typed', () => {
    expect(fieldsFor('odometer_reading').map((f) => f.path)).not.toContain('km');
    const r = buildAttributes('odometer_reading', { originalValue: '46,000', originalUnit: 'mi' });
    expect(r).toEqual({ ok: true, attributes: { km: 74030, originalValue: 46000, originalUnit: 'mi' } });
  });

  it('fills fixed values and nested groups (auction price in UGX, export mileage)', () => {
    const r = buildAttributes('auction_sale', { auctionGrade: '4.5', 'exportMileage.value': '41200', 'exportMileage.unit': 'km', 'price.amount': '18000000' });
    expect(r).toEqual({ ok: true, attributes: { auctionGrade: '4.5', exportMileage: { value: 41200, unit: 'km' }, price: { amount: 18000000, currency: 'UGX' } } });
    const noPrice = buildAttributes('auction_sale', { auctionGrade: '4' });
    expect(noPrice).toEqual({ ok: true, attributes: { auctionGrade: '4' } });
  });

  it('explains what is wrong in plain words', () => {
    const r = buildAttributes('plate_changed', { oldPlate: 'UAA 111A', reason: 'stolen' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.map((e) => e.message)).toEqual(['New plate is required', 'Reason: use one of replacement, re_registration, personalised, correction']);
    expect(buildAttributes('inspection_result', { passed: 'maybe' })).toEqual({ ok: false, errors: [{ path: 'passed', message: 'Passed: use yes or no' }] });
  });

  it('lists the CSV columns for a source', () => {
    expect(csvColumns('police').slice(0, 5)).toEqual(['vin', 'chassis_number', 'plate', 'record_type', 'date']);
    expect(csvColumns('finance')).toEqual(['vin', 'chassis_number', 'plate', 'record_type', 'date']);
  });
});

describe('what buyers see of a record (security S6)', () => {
  it('drops undeclared fields, including inside nested objects', () => {
    expect(buyerVisibleAttributes('import_recorded', { originCountry: 'JP', note: 'agent: John Doe', exportMileage: { value: 1, unit: 'km', extra: 'x' } }))
      .toEqual({ originCountry: 'JP', exportMileage: { value: 1, unit: 'km' } });
    expect(buyerVisibleAttributes('inspection_result', { passed: true, defects: [{ item: 'tyre', severity: 'minor', mechanic: 'Sam' }] }))
      .toEqual({ passed: true, defects: [{ item: 'tyre', severity: 'minor' }] });
  });
  it('shows nothing of free-form records', () => {
    expect(buyerVisibleAttributes('customs_cleared', { clearingAgent: 'Jane', phone: '+256772000000' })).toEqual({});
    expect(buyerVisibleAttributes('total_loss_declared', { insurer: 'X', claimant: 'Y' })).toEqual({});
  });
  it('never shows links to people or intake phone numbers', () => {
    expect(buyerVisibleAttributes('registration_issued', { plate: 'UBJ 214K', ownerPartyId: '00000000-0000-4000-8000-000000000000', ownerPhone: '+256772000000' }))
      .toEqual({ plate: 'UBJ 214K' });
  });
  it('rejects unknown record types', () => {
    expect(buyerVisibleAttributes('nope', { a: 1 })).toEqual({});
  });
});
