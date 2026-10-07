// The Scenario Dataset (docs/design/scenario-dataset.md) as executable data.
// Each scenario's `expected` block is the acceptance test for Rule Set v1 (docs/design/rule-set-v1.md §12).
import { q, type Scenario, VehicleBuilder } from './builder.js';

const spec = (make: string, model: string, year: number, colour: string, extra: Record<string, unknown> = {}) =>
  ({ make, model, year, colour, ...extra });

const scenarios: Scenario[] = [];
const add = (s: Scenario) => scenarios.push(s);

// S01 — Clean, complete history
{
  const v = new VehicleBuilder('S01').ident('chassis_number', 'ZSU60-0071234');
  v.add('AUC', '2020-02-14', 'auction_sale', { auctionGrade: '4.5', exportMileage: { value: 41200, unit: 'km' } });
  v.add('CUS', '2020-04-02', 'import_recorded', { originCountry: 'JP', port: 'Mombasa' });
  v.add('CUS', '2020-04-02', 'customs_cleared', {});
  v.add('REG', '2020-04-20', 'registration_issued', { plate: 'UBJ 214K' });
  v.add('REG', '2020-04-20', 'spec_declared', spec('Toyota', 'Harrier', 2016, 'pearl white', { engineCc: 2000, fuel: 'petrol', transmission: 'cvt' }));
  for (const [d, km] of [['2020-09-10', 44900], ['2021-09-12', 58300], ['2022-09-14', 69800], ['2023-11-02', 80100], ['2024-10-08', 91500], ['2025-09-15', 102600]] as const) v.service('GAR-NSA', d, km);
  v.confirmAllGarageVisits();
  v.add('INSP', '2026-06-10', 'inspection_result', { passed: true, structuralFindings: false, tyresPercent: 60, batteryOk: true, observedColour: 'pearl white' });
  add({ id: 'S01', title: 'Clean, complete history', vehicle: v.build(), comparablesCount: 17,
    expected: { questions: q('✓✓✓✓✓✓✓'), recordConfidence: 'high', health: 88, noFlags: true } });
}

// S02 — Thin history (pre-2015 import not covered by customs)
{
  const v = new VehicleBuilder('S02').ident('chassis_number', 'NZT260-3024411');
  v.add('REG', '2014-03-11', 'registration_issued', { plate: 'UAX 553F' });
  v.add('REG', '2014-03-11', 'spec_declared', spec('Toyota', 'Premio', 2010, 'silver'));
  add({ id: 'S02', title: 'Thin history', vehicle: v.build(), comparablesCount: 22,
    expected: { questions: q('✓–✓––✓✓'), recordConfidence: 'insufficient', health: 'insufficient', noFlags: true } });
}

// S03 — Local mileage rollback
{
  const v = new VehicleBuilder('S03').ident('chassis_number', 'ACA36-5012345');
  v.baseline('2019-06-01', '2019-06-20', 'UBC 718P', spec('Toyota', 'RAV4', 2015, 'white'));
  v.service('GAR-NSA', '2021-07-05', 96500);
  v.attest('S03-GAR-NSA-2021-07-05', 'confirmed');
  v.add('INSP', '2023-03-18', 'inspection_result', { passed: true });
  v.add('INSP', '2023-03-18', 'odometer_reading', { km: 121000, originalValue: 121000, originalUnit: 'km' });
  v.service('GAR-KIR', '2025-02-09', 88400, { noEvidence: true });
  add({ id: 'S03', title: 'Local mileage rollback', vehicle: v.build(), comparablesCount: 15,
    expected: { questions: q('✓!✓✗✓✓✓'), recordConfidence: 'low', health: 49, flags: ['mileage_decrease'],
      headlines: { mileage: 'mileage.serious.decrease' } } });
}

// S04 — Clocked before import
{
  const v = new VehicleBuilder('S04').ident('chassis_number', 'GRX130-6045678');
  v.add('AUC', '2019-11-21', 'auction_sale', { exportMileage: { value: 148000, unit: 'km' } });
  v.baseline('2020-01-15', '2020-01-30', 'UBE 260R', spec('Toyota', 'Mark X', 2012, 'black'));
  for (const [d, km] of [['2020-08-12', 72300], ['2021-08-10', 80100], ['2023-11-20', 95400], ['2025-06-18', 108900]] as const) v.service('GAR-BWE', d, km);
  add({ id: 'S04', title: 'Clocked before import', vehicle: v.build(), comparablesCount: 8,
    expected: { questions: q('✓✓✓✗!✓✓'), recordConfidence: 'low', health: 54, flags: ['mileage_decrease'],
      headlines: { provenance: 'provenance.attention.export_mileage_conflict' } } });
}

// S05 — Odometer cluster replaced legitimately (G1)
{
  const v = new VehicleBuilder('S05').ident('chassis_number', 'ZRR70-0423456');
  v.baseline('2018-05-10', '2018-06-01', 'UBA 905T', spec('Toyota', 'Noah', 2013, 'silver'));
  v.service('GAR-MUT', '2022-04-14', 134000);
  v.add('GAR-MUT', '2023-11-03', 'component_replaced', { component: 'instrument_cluster', readingBefore: 141200, readingAfter: 12, reason: 'faulty cluster' });
  v.service('GAR-MUT', '2025-08-22', 18500);
  add({ id: 'S05', title: 'Odometer replaced (declared)', vehicle: v.build(), comparablesCount: 9,
    expected: { questions: q('✓✓✓!✓✓✓'), recordConfidence: 'high', health: 60, noFlags: true,
      facts: { current_mileage_km: 159688 }, headlines: { mileage: 'mileage.attention.odometer_replaced' } } });
}

// S06 — Declared engine replacement (D-031)
{
  const v = new VehicleBuilder('S06').ident('chassis_number', 'NZT260-3048271');
  v.baseline('2019-02-10', '2019-03-01', 'UBK 482M', spec('Toyota', 'Premio', 2014, 'silver', { engineNumber: '1NZ-A111111' }));
  for (const [d, km] of [['2023-10-05', 118000], ['2024-10-07', 131500], ['2025-10-06', 144200]] as const) v.service('GAR-MUT', d, km);
  v.add('GAR-MUT', '2026-09-12', 'component_replaced', { component: 'engine', oldSerial: '1NZ-A111111', newSerial: '1NZ-B222222', reason: 'seized' });
  v.add('GAR-MUT', '2026-09-12', 'odometer_reading', { km: 151870, originalValue: 151870, originalUnit: 'km' });
  v.add('GAR-MUT', '2026-09-12', 'cost_recorded', { amount: 4250000, currency: 'UGX' });
  v.confirmAllGarageVisits();
  add({ id: 'S06', title: 'Declared engine replacement', vehicle: v.build(), comparablesCount: 20,
    expected: { questions: q('✓✓✓✓✓✓✓'), recordConfidence: 'high', health: 71, noFlags: true,
      facts: { current_engine_number: '1NZ-B222222', registered_engine_number: '1NZ-A111111' } } });
}

// S07 — Engine number changed, nothing declared
{
  const v = new VehicleBuilder('S07').ident('chassis_number', 'ZNE14-0234567');
  v.baseline('2016-04-12', '2016-05-02', 'UBF 119J', spec('Toyota', 'Wish', 2010, 'white', { engineNumber: '1ZZ-C333333' }));
  v.add('INSP', '2026-08-20', 'inspection_result', { passed: true, observedEngineNumber: '1ZZ-D444444', observedColour: 'white' });
  add({ id: 'S07', title: 'Undeclared engine change', vehicle: v.build(), comparablesCount: 6,
    expected: { questions: q('!–✓–✓✓✓'), recordConfidence: 'low', health: 'insufficient', flags: ['undeclared_engine_change'] } });
}

// S08a / S08b — Cloned plate UAX 123A (identity alerts come from the Vehicle Registry)
{
  const a = new VehicleBuilder('S08a').ident('chassis_number', 'NZT260-3011111').ident('registration_plate', 'UAX 123A');
  a.add('CUS', '2015-03-02', 'import_recorded', { originCountry: 'JP' });
  const reg = a.add('REG', '2015-04-01', 'registration_issued', { plate: 'UAX 123A' });
  a.add('REG', '2015-04-01', 'spec_declared', spec('Toyota', 'Premio', 2011, 'white'));
  a.service('GAR-NSA', '2024-03-12', 88000).service('GAR-NSA', '2025-03-14', 99500);
  a.alert({ check: 'cloned_plate_suspected', observationIds: [reg], relatedVehicleIds: ['S08b'] });
  add({ id: 'S08a', title: 'Cloned plate — genuine Premio', vehicle: a.build(), comparablesCount: 22,
    expected: { questions: q('✗✓✓✓✓✓✓'), recordConfidence: 'low', flags: ['cloned_plate_suspected'] } });

  const b = new VehicleBuilder('S08b').ident('chassis_number', 'ZSU60-0099999').ident('registration_plate', 'UBF 778B').ident('registration_plate', 'UAX 123A');
  b.baseline('2021-01-08', '2021-02-01', 'UBF 778B', spec('Toyota', 'Harrier', 2017, 'silver'));
  const kirReading = b.add('GAR-KIR', '2025-03-10', 'odometer_reading', { km: 61000, originalValue: 61000, originalUnit: 'km' });
  b.add('GAR-KIR', '2025-03-10', 'service_performed', { items: ['engine_oil'] });
  b.alert({ check: 'cloned_plate_suspected', observationIds: [kirReading], relatedVehicleIds: ['S08a'] });
  add({ id: 'S08b', title: 'Cloned plate — Harrier using UAX 123A', vehicle: b.build(), comparablesCount: 12,
    expected: { questions: q('✗!✓–✓✓✓'), recordConfidence: 'low', flags: ['cloned_plate_suspected'] } });
}

// S09 — Legitimate plate replacement (G6)
{
  const v = new VehicleBuilder('S09').ident('chassis_number', 'NCP160-0045566');
  v.baseline('2016-01-11', '2016-02-03', 'UAR 902C', spec('Toyota', 'Probox', 2014, 'white'));
  v.add('REG', '2025-05-05', 'plate_changed', { oldPlate: 'UAR 902C', newPlate: 'UBQ 330D', reason: 'replacement' });
  for (const [d, km] of [['2024-04-09', 150000], ['2025-07-15', 171000], ['2026-06-10', 188000]] as const) v.service('GAR-BWE', d, km);
  add({ id: 'S09', title: 'Legitimate plate replacement', vehicle: v.build(), comparablesCount: 9,
    expected: { questions: q('✓✓✓✓✓✓✓'), recordConfidence: 'high', noFlags: true,
      facts: { current_plate: 'UBQ330D', previous_plates: ['UAR902C'] } } });
}

// S10 — Stolen, then recovered
{
  const v = new VehicleBuilder('S10').ident('chassis_number', 'NZE161-7034512');
  v.baseline('2018-01-15', '2018-02-01', 'UBG 447L', spec('Toyota', 'Fielder', 2012, 'grey'));
  v.add('POL', '2024-03-04', 'stolen_reported', {});
  v.add('POL', '2024-05-19', 'stolen_recovered', {});
  for (const [d, km] of [['2023-12-05', 101000], ['2024-08-20', 108500], ['2025-08-21', 121000]] as const) v.service('GAR-NSA', d, km);
  add({ id: 'S10', title: 'Stolen, then recovered', vehicle: v.build(), comparablesCount: 18,
    expected: { questions: q('✓✓✓✓✓!✓'), recordConfidence: 'high', headlines: { legal_financial: 'legal_financial.attention.stolen_recovered' } } });
}

// S11 — Currently reported stolen
{
  const v = new VehicleBuilder('S11').ident('chassis_number', 'SJ5-0123987');
  v.baseline('2017-02-01', '2017-03-01', 'UBH 031N', spec('Subaru', 'Forester', 2013, 'blue'));
  v.add('POL', '2026-08-11', 'stolen_reported', {});
  add({ id: 'S11', title: 'Currently reported stolen', vehicle: v.build(), comparablesCount: 7,
    expected: { questions: q('✓–✓–✓✗✓'), recordConfidence: 'low', health: 'insufficient' } });
}

// S12 — Active finance lien
{
  const v = new VehicleBuilder('S12').ident('chassis_number', 'TRJ150-0045123');
  v.baseline('2016-06-01', '2016-06-20', 'UBD 812W', spec('Toyota', 'Land Cruiser Prado', 2015, 'white'));
  v.add('LIEN', '2024-02-12', 'finance_lien_registered', {});
  add({ id: 'S12', title: 'Active finance lien', vehicle: v.build(), comparablesCount: 11,
    expected: { questions: q('✓–✓–✓!✓'), recordConfidence: 'low', facts: { finance_status: 'active' } } });
}

// S13 — Lien registered and discharged
{
  const v = new VehicleBuilder('S13').ident('chassis_number', 'ZRT261-3012876');
  v.baseline('2015-09-01', '2015-09-20', 'UAZ 664E', spec('Toyota', 'Allion', 2010, 'silver'));
  v.add('LIEN', '2021-03-10', 'finance_lien_registered', {});
  v.add('LIEN', '2023-04-14', 'finance_lien_discharged', {});
  add({ id: 'S13', title: 'Lien discharged', vehicle: v.build(), comparablesCount: 16,
    expected: { questions: q('✓–✓–✓✓✓'), recordConfidence: 'medium', facts: { finance_status: 'cleared' } } });
}

// S14 — Structural accident, repaired (Health ≠ Record confidence)
{
  const v = new VehicleBuilder('S14').ident('chassis_number', 'NT32-0067234');
  v.baseline('2018-07-02', '2018-08-01', 'UBB 377Q', spec('Nissan', 'X-Trail', 2014, 'red'));
  v.add('INS-N', '2023-06-08', 'insurance_claim', { claimType: 'collision' });
  v.add('INS-N', '2023-06-08', 'damage_assessed', { areas: ['front'], severity: 'severe', structural: true });
  v.add('GAR-BWE', '2023-07-20', 'repair_performed', { components: ['chassis_rail', 'front_panels'], structural: true });
  v.add('GAR-BWE', '2023-07-20', 'paint_work', { areas: ['front'], reason: 'accident' });
  v.add('GAR-BWE', '2023-07-20', 'odometer_reading', { km: 88000, originalValue: 88000, originalUnit: 'km' });
  v.add('INSP', '2024-03-15', 'inspection_result', { passed: true, structuralFindings: false });
  v.service('GAR-BWE', '2024-09-10', 97000).service('GAR-BWE', '2025-09-12', 106500);
  add({ id: 'S14', title: 'Structural accident, repaired', vehicle: v.build(), comparablesCount: 9,
    expected: { questions: q('✓✓✗✓✓✓✓'), recordConfidence: 'high', health: 51 } });
}

// S15 — Total loss, rebuilt (G5)
{
  const v = new VehicleBuilder('S15').ident('chassis_number', 'KSP130-2045678');
  v.baseline('2017-04-03', '2017-05-02', 'UAW 208H', spec('Toyota', 'Vitz', 2011, 'white'));
  v.add('INS-N', '2022-02-10', 'total_loss_declared', {});
  v.add('GAR-BWE', '2022-08-15', 'repair_performed', { components: ['body_shell'], structural: true });
  v.add('GAR-BWE', '2022-08-15', 'odometer_reading', { km: 98000, originalValue: 98000, originalUnit: 'km' });
  v.add('INSP', '2023-01-15', 'inspection_result', { passed: true });
  v.service('GAR-BWE', '2024-05-14', 108000).service('GAR-BWE', '2025-06-17', 117500);
  add({ id: 'S15', title: 'Total loss, rebuilt', vehicle: v.build(), comparablesCount: 12,
    expected: { questions: q('✓✓✗✓!✓!'), recordConfidence: 'high', health: 38, facts: { title_status: 'rebuilt' } } });
}

// S16 — Flood damage, no garage history
{
  const v = new VehicleBuilder('S16').ident('chassis_number', 'GP1-1034567');
  v.baseline('2019-01-07', '2019-02-04', 'UBF 590S', spec('Honda', 'Fit', 2013, 'blue'));
  v.add('INS-N', '2024-04-22', 'flood_damage_reported', {});
  add({ id: 'S16', title: 'Flood damage, no garage history', vehicle: v.build(), comparablesCount: 10,
    expected: { questions: q('✓–✗–✓✓✓'), recordConfidence: 'low', health: 'insufficient' } });
}

// S17 — Former rental car
{
  const v = new VehicleBuilder('S17').ident('chassis_number', 'NKE165-7012345');
  v.baseline('2018-11-05', '2018-12-03', 'UBC 144V', spec('Toyota', 'Axio', 2014, 'white'));
  v.add('RENT', '2019-01-01', 'rental_period', { from: '2019-01-01', to: '2022-12-31' });
  for (const [d, km] of [['2019-01-15', 38000], ['2020-01-15', 90000], ['2021-01-15', 142000], ['2022-01-15', 194000], ['2022-12-15', 246000]] as const) {
    v.add('RENT', d, 'odometer_reading', { km, originalValue: km, originalUnit: 'km' });
    v.add('RENT', d, 'service_performed', { items: ['engine_oil', 'brake_pads'] });
  }
  for (const [d, km] of [['2024-02-06', 262000], ['2025-02-04', 276000], ['2026-02-10', 290500]] as const) v.service('GAR-NSA', d, km);
  add({ id: 'S17', title: 'Former rental car', vehicle: v.build(), comparablesCount: 14,
    expected: { questions: q('✓✓✓✓!✓✓'), recordConfidence: 'high', health: 51, noFlags: true,
      headlines: { provenance: 'provenance.attention.usage_rental' } } });
}

// S18 — Commercial passenger taxi (PSV)
{
  const v = new VehicleBuilder('S18').ident('chassis_number', 'KDH200-0012345');
  v.baseline('2010-03-01', '2010-04-01', 'UAQ 771B', spec('Toyota', 'Hiace', 2008, 'white'));
  v.add('REG', '2012-01-10', 'usage_declared', { usage: 'psv' });
  for (const [d, km] of [['2023-12-04', 380000], ['2024-12-02', 396000], ['2025-12-01', 412000]] as const) v.service('GAR-BWE', d, km);
  add({ id: 'S18', title: 'Commercial passenger taxi', vehicle: v.build(), comparablesCount: 3,
    expected: { questions: q('✓✓✓✓!✓!'), recordConfidence: 'high', health: 45 } });
}

// S19 — Declared colour change (G8)
{
  const v = new VehicleBuilder('S19').ident('chassis_number', 'KE2FW-0123456');
  v.baseline('2018-03-05', '2018-04-02', 'UBJ 650D', spec('Mazda', 'CX-5', 2015, 'red'));
  v.add('GAR-NSA', '2024-02-10', 'paint_work', { areas: ['full_body'], oldColour: 'red', newColour: 'black', reason: 'cosmetic' });
  v.service('GAR-NSA', '2024-02-10', 71000);
  v.service('GAR-NSA', '2025-03-11', 79000);
  v.add('INSP', '2025-05-20', 'inspection_result', { passed: true, observedColour: 'black' });
  v.service('GAR-NSA', '2026-03-10', 88500);
  add({ id: 'S19', title: 'Declared colour change', vehicle: v.build(), comparablesCount: 6,
    expected: { questions: q('✓✓✓✓✓✓✓'), recordConfidence: 'high', noFlags: true,
      facts: { registered_colour: 'red', current_colour: 'black' } } });
}

// S20 — Colour mismatch, nothing recorded
{
  const v = new VehicleBuilder('S20').ident('chassis_number', 'ACM21-0123456');
  v.baseline('2015-06-01', '2015-07-01', 'UAT 382G', spec('Toyota', 'Ipsum', 2004, 'silver'));
  v.add('INSP', '2026-07-14', 'inspection_result', { passed: true, observedColour: 'blue' });
  add({ id: 'S20', title: 'Colour mismatch', vehicle: v.build(), comparablesCount: 5,
    expected: { questions: q('!–✓–✓✓✓'), recordConfidence: 'low', flags: ['spec_mismatch'] } });
}

// S21 — Owner disputes a garage record
{
  const v = new VehicleBuilder('S21').ident('chassis_number', 'KGC30-0123456');
  v.baseline('2017-05-02', '2017-06-01', 'UBG 909K', spec('Toyota', 'Passo', 2012, 'white'));
  v.service('GAR-NSA', '2023-11-14', 52000).service('GAR-NSA', '2025-01-20', 58500);
  v.service('GAR-KIR', '2026-07-15', 64000);
  v.attest('S21-GAR-KIR-2026-07-15', 'disputed');
  add({ id: 'S21', title: 'Owner disputes a garage record', vehicle: v.build(), comparablesCount: 13,
    expected: { questions: q('✓!✓✓✓✓✓'), recordConfidence: 'medium', headlines: { care: 'care.attention.disputed' } } });
}

// S22 — Customer (not the registered owner) confirms (G3)
{
  const v = new VehicleBuilder('S22').ident('chassis_number', 'NZT260-3098765');
  v.baseline('2019-04-01', '2019-05-02', 'UBE 515C', spec('Toyota', 'Premio', 2016, 'white'));
  v.service('GAR-NSA', '2024-05-07', 61000).service('GAR-NSA', '2025-05-06', 73000).service('GAR-NSA', '2026-05-05', 84500);
  v.attest('S22-GAR-NSA-2026-05-05', 'confirmed', 'customer');
  add({ id: 'S22', title: 'Driver confirms, not the owner', vehicle: v.build(), comparablesCount: 20,
    expected: { questions: q('✓✓✓✓✓✓✓'), recordConfidence: 'high', noFlags: true } });
}

// S23 — Mileage typo, then corrected (append-only correction)
function s23(): VehicleBuilder {
  const v = new VehicleBuilder('S23').ident('chassis_number', 'ZSU60-0034567');
  v.baseline('2019-08-05', '2019-09-02', 'UBA 288X', spec('Toyota', 'Harrier', 2014, 'black'));
  v.service('GAR-MUT', '2024-03-05', 128000).service('GAR-MUT', '2025-03-04', 141000);
  const typo = v.add('GAR-MUT', '2026-03-02', 'odometer_reading', { km: 1540000, originalValue: 1540000, originalUnit: 'km' }, { id: 'S23-typo' });
  v.add('GAR-MUT', '2026-03-02', 'service_performed', { items: ['engine_oil'] });
  const fix = v.add('GAR-MUT', '2026-03-02', 'odometer_reading', { km: 154000, originalValue: 154000, originalUnit: 'km' }, { id: 'S23-fix', recordedAt: '2026-03-03T08:00:00Z' });
  v.relate(fix, typo, 'corrects');
  return v;
}
add({ id: 'S23', title: 'Mileage typo, then corrected', vehicle: s23().build(), comparablesCount: 17,
  expected: { questions: q('✓✓✓✓✓✓✓'), recordConfidence: 'high', noFlags: true, facts: { current_mileage_km: 154000 } } });

// S24 — Owner-entered vehicle, after it was matched and merged with the official record
{
  const v = new VehicleBuilder('S24').ident('chassis_number', 'GP3-0123456').ident('registration_plate', 'UBD 640H');
  v.add('REG', '2016-08-01', 'registration_issued', { plate: 'UBD 640H' });
  v.add('REG', '2016-08-01', 'spec_declared', spec('Subaru', 'Impreza', 2012, 'grey'));
  v.add('OWN', '2025-06-10', 'spec_declared', { make: 'Subaru', model: 'Impreza' });
  v.add('OWN', '2025-06-10', 'odometer_reading', { km: 97000, originalValue: 97000, originalUnit: 'km' });
  v.add('CUS', '2026-01-12', 'import_recorded', { originCountry: 'JP' });
  add({ id: 'S24', title: 'Owner-entered vehicle, merged after an import record arrived', vehicle: v.build(), comparablesCount: 5,
    expected: { questions: q('✓–✓–✓✓✓'), recordConfidence: 'low' } });

  const pre = new VehicleBuilder('S24-pre').ident('registration_plate', 'UBD 640H');
  pre.status = 'provisional';
  pre.add('OWN', '2025-06-10', 'spec_declared', { make: 'Subaru', model: 'Impreza' });
  pre.add('OWN', '2025-06-10', 'odometer_reading', { km: 97000, originalValue: 97000, originalUnit: 'km' });
  add({ id: 'S24-pre', title: 'Owner-entered vehicle, before matching (provisional)', vehicle: pre.build(), comparablesCount: 5,
    expected: { questions: q('!–––––✓'), recordConfidence: 'insufficient', health: 'insufficient' } });
}

// S25 — Owner-entered, never corroborated
{
  const v = new VehicleBuilder('S25').ident('registration_plate', 'UAK 090Z');
  v.status = 'provisional';
  v.add('OWN', '2026-02-03', 'spec_declared', { make: 'Mitsubishi', model: 'Pajero', year: 2006 });
  v.add('OWN', '2026-02-03', 'odometer_reading', { km: 210000, originalValue: 210000, originalUnit: 'km' });
  add({ id: 'S25', title: 'Owner-entered, never corroborated', vehicle: v.build(), comparablesCount: 6,
    expected: { questions: q('!–––––✓'), recordConfidence: 'insufficient', health: 'insufficient',
      headlines: { identity: 'identity.attention.provisional' } } });
}

// S26 — UK import with odometer in miles (G7)
{
  const v = new VehicleBuilder('S26').ident('vin', 'WDD2050042F123456');
  v.add('CUS', '2020-11-09', 'import_recorded', { originCountry: 'GB', port: 'Mombasa', exportMileage: { value: 46000, unit: 'mi' } });
  v.add('REG', '2020-12-01', 'registration_issued', { plate: 'UBK 703A' });
  v.add('REG', '2020-12-01', 'spec_declared', spec('Mercedes-Benz', 'C200', 2014, 'black'));
  for (const [d, km] of [['2021-05-11', 79500], ['2023-12-05', 95000], ['2025-01-14', 103000], ['2026-01-13', 111000]] as const) v.service('GAR-NSA', d, km);
  add({ id: 'S26', title: 'UK import, odometer in miles', vehicle: v.build(), comparablesCount: 3,
    expected: { questions: q('✓✓✓✓✓✓!'), recordConfidence: 'high', noFlags: true } });
}

export const SCENARIOS: readonly Scenario[] = scenarios;
export { s23 as buildS23 };
