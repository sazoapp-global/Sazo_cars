// Canonical facts (Rule Set §6).
import { normalizeIdentifier } from '@sazo/contracts';
import { colourTimeline } from './checks.js';
import { currentMileage, type MileageSeries } from './mileage.js';
import { ms } from './time.js';
import type { EngineObservation, Fact } from './types.js';
import type { WorkingSet } from './working-set.js';

const CLASS_RANK = { official: 5, inspection: 4, garage: 3, dealer: 2, owner_provided: 1, community: 0 } as const;

export interface FactInputs {
  ws: WorkingSet;
  series: MileageSeries;
  qualifying: EngineObservation[];
  confidence: (id: string) => number;
}

export function deriveFacts({ ws, series, qualifying, confidence }: FactInputs): Record<string, Fact> {
  const facts: Record<string, Fact> = {};
  const set = (key: string, value: unknown, obs: EngineObservation[] | string[], extra: Partial<Fact> = {}) => {
    const ids = obs.map((o) => (typeof o === 'string' ? o : o.id));
    const conf = ids.length ? Math.min(...ids.map((id) => confidence(id))) : 0;
    facts[key] = { value, confidence: conf, supporting: ids, ...extra };
  };
  const rank = (o: EngineObservation) => CLASS_RANK[ws.source(o).evidenceClass];
  const best = (cands: EngineObservation[]) =>
    [...cands].sort((a, b) =>
      confidence(b.id) - confidence(a.id) || rank(b) - rank(a) || ms(b.eventTime ?? b.recordedAt) - ms(a.eventTime ?? a.recordedAt))[0];
  const latest = (cands: EngineObservation[]) =>
    [...cands].filter((o) => o.eventTime).sort((a, b) => ms(b.eventTime!) - ms(a.eventTime!))[0];
  const of = (...types: string[]) => qualifying.filter((o) => types.includes(o.type));

  // Spec fields: best spec_declared that has the field.
  for (const field of ['make', 'model', 'year', 'body', 'fuel', 'transmission'] as const) {
    const o = best(of('spec_declared').filter((x) => x.attributes[field] !== undefined));
    if (o) set(field, o.attributes[field], [o]);
  }

  // Colour (G8).
  const officialSpec = of('spec_declared').filter((o) => o.attributes.colour && ws.source(o).evidenceClass === 'official');
  const reg = latest(officialSpec);
  if (reg) set('registered_colour', reg.attributes.colour, [reg]);
  const colourAt = colourTimeline(ws);
  const lastInspectionColour = latest(of('inspection_result').filter((o) => o.attributes.observedColour));
  const expectedNow = colourAt(ws.ctx.asOf);
  if (lastInspectionColour && (!expectedNow.basis ||
      ms(lastInspectionColour.eventTime!) >= ms(qualifying.find((o) => o.id === expectedNow.basis)?.eventTime ?? '1970-01-01'))) {
    set('current_colour', lastInspectionColour.attributes.observedColour, [lastInspectionColour]);
  } else if (expectedNow.colour) {
    set('current_colour', expectedNow.colour, [expectedNow.basis!]);
  }

  // Plate.
  const plateEvents = of('registration_issued', 'plate_changed').filter((o) => o.eventTime);
  const lastPlate = latest(plateEvents);
  if (lastPlate) {
    set('current_plate', normalizeIdentifier(String(lastPlate.attributes.newPlate ?? lastPlate.attributes.plate)), [lastPlate]);
    const previous = plateEvents
      .filter((o) => o.type === 'plate_changed')
      .map((o) => normalizeIdentifier(String(o.attributes.oldPlate)));
    if (previous.length) set('previous_plates', previous, plateEvents.filter((o) => o.type === 'plate_changed'));
  }

  // Engine numbers.
  const regEngineAny = best(of('spec_declared').filter((o) => o.attributes.engineNumber && ws.source(o).evidenceClass === 'official'));
  if (regEngineAny) set('registered_engine_number', regEngineAny.attributes.engineNumber, [regEngineAny]);
  const lastSwap = latest(of('component_replaced').filter((o) => o.attributes.component === 'engine'));
  const lastObservedEngine = latest(of('inspection_result').filter((o) => o.attributes.observedEngineNumber));
  const engineCands = [lastSwap, lastObservedEngine].filter((x): x is EngineObservation => !!x);
  const engineNow = latest(engineCands);
  if (engineNow) {
    set('current_engine_number', engineNow.type === 'component_replaced' ? engineNow.attributes.newSerial : engineNow.attributes.observedEngineNumber, [engineNow]);
  } else if (regEngineAny) {
    set('current_engine_number', regEngineAny.attributes.engineNumber, [regEngineAny]);
  }

  // Mileage (G1, G7).
  const usable = new Set(qualifying.map((o) => o.id));
  const mileage = currentMileage(series, (id) => usable.has(id));
  if (mileage) set('current_mileage_km', mileage.km, mileage.supporting, { estimated: mileage.estimated, confidence: Math.min(...mileage.supporting.map(confidence)) * (mileage.estimated ? 0.8 : 1) });

  // Ownership & usage.
  const registrations = of('registration_issued');
  if (registrations.length) set('owner_count', 1 + of('ownership_transferred').length, [...registrations, ...of('ownership_transferred')]);
  const usageDecl = latest(of('usage_declared'));
  const rentals = of('rental_period');
  const usageHistory = [...new Set([...of('usage_declared').map((o) => String(o.attributes.usage)), ...(rentals.length ? ['rental'] : [])])];
  if (usageDecl || rentals.length) {
    const activeRental = rentals.find((o) => !o.attributes.to || ms(String(o.attributes.to)) >= ms(ws.ctx.asOf));
    set('usage_type', activeRental ? 'rental' : usageDecl ? usageDecl.attributes.usage : 'private', [...(usageDecl ? [usageDecl] : []), ...rentals]);
    set('usage_history', usageHistory, [...of('usage_declared'), ...rentals]);
  }

  // Legal & finance.
  const lien = latest(of('finance_lien_registered', 'finance_lien_discharged'));
  if (lien) set('finance_status', lien.type === 'finance_lien_registered' ? 'active' : 'cleared', [lien]);
  const stolen = latest(of('stolen_reported', 'stolen_recovered'));
  if (stolen) set('stolen_status', stolen.type === 'stolen_reported' ? 'open' : 'recovered', [stolen]);
  const impound = latest(of('impounded', 'released'));
  if (impound) set('impound_status', impound.type === 'impounded' ? 'impounded' : 'released', [impound]);

  // Title status (G5).
  const totalLoss = latest(of('total_loss_declared'));
  if (totalLoss) {
    const passAfter = of('inspection_result').find((o) => o.attributes.passed === true && o.eventTime && ms(o.eventTime) > ms(totalLoss.eventTime!));
    set('title_status', passAfter ? 'rebuilt' : 'total_loss', passAfter ? [totalLoss, passAfter] : [totalLoss]);
  } else {
    set('title_status', 'clean', []);
    facts.title_status!.confidence = 1;
  }

  // Import & first registration.
  const imp = best(of('import_recorded'));
  if (imp) set('import_origin', imp.attributes.originCountry, [imp]);
  const firstReg = [...registrations].filter((o) => o.eventTime).sort((a, b) => ms(a.eventTime!) - ms(b.eventTime!))[0];
  if (firstReg) set('first_registration_date', firstReg.eventTime!.slice(0, 10), [firstReg]);

  return facts;
}
