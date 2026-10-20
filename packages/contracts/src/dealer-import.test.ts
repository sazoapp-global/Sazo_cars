import { describe, expect, it } from 'vitest';
import { DEALER_IMPORT_COLUMNS, importHeaderKey, parseDealerImportRow } from './dealer-import.js';

describe('dealer file import (D-131)', () => {
  it('reads the template headings and the usual other names for them', () => {
    for (const c of DEALER_IMPORT_COLUMNS) expect(importHeaderKey(c.label)).toBe(c.key);
    expect(importHeaderKey('VIN')).toBe('chassis');
    expect(importHeaderKey('Chassis No.')).toBe('chassis');
    expect(importHeaderKey('Selling Price')).toBe('price');
    expect(importHeaderKey('Something else')).toBeUndefined();
  });

  it('reads Ugandan dates, prices with commas and friendly words', () => {
    const { row, problems } = parseDealerImportRow({ make: 'Toyota', price: 'UGX 75,000,000', receivedOn: '31/12/2025', stage: 'In the bond', fuel: 'Gas', gearbox: 'MT' }, false);
    expect(problems).toEqual([]);
    expect(row).toMatchObject({ askingPriceUgx: 75_000_000, receivedOn: '2025-12-31', stage: 'in_bond', fuel: 'lpg', transmission: 'manual', costs: [] });
  });

  it('a 17-character VIN is a VIN, anything else is a chassis number', () => {
    expect(parseDealerImportRow({ chassis: 'jtmhv05j604123456', price: '1' }, false).row.vin).toBe('JTMHV05J604123456');
    expect(parseDealerImportRow({ chassis: 'ZSU60-0099887', price: '1' }, false).row.chassisNumber).toBe('ZSU600099887');
  });

  it('explains every problem in plain words', () => {
    const { problems } = parseDealerImportRow({ year: '1890', receivedOn: '31/02/2026', price: 'abc' }, true);
    expect(problems).toEqual(expect.arrayContaining(['Year should be between 1950 and ' + (new Date().getUTCFullYear() + 1),
      'Date received should be a date such as 2026-10-01 or 01/10/2026', 'Asking price should be a whole number in UGX', 'Enter the make, or the number plate or chassis number']));
  });

  it('costs are read only for managers', () => {
    expect(parseDealerImportRow({ make: 'Toyota', price: '1', cost_purchase: '9500' }, false).row.costs).toEqual([]);
    expect(parseDealerImportRow({ make: 'Toyota', price: '1', cost_purchase: '9,500' }, true).row.costs).toEqual([{ category: 'purchase', amount: 9500, currency: 'UGX' }]);
  });
});
