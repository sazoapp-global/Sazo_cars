// Consistency checks C3, C8, C9 (Rule Set §4) and conversion of registry identity alerts (C4–C7) into flags.
// Mileage checks C1/C2 live in mileage.ts; C10 (duplicates) in working-set.ts.
import { normalizeIdentifier } from '@sazo/contracts';
import { PARAMS } from './params.js';
import { daysBetween, ms } from './time.js';
import type { EngineObservation, Flag, IdentityAlert } from './types.js';
import type { WorkingSet } from './working-set.js';

const norm = (v: unknown): string => normalizeIdentifier(String(v ?? ''));
const sameColour = (a: unknown, b: unknown): boolean => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** C3 undeclared_engine_change. */
export function engineFlags(ws: WorkingSet): Flag[] {
  const official = ws.included.filter((o) => ws.source(o).evidenceClass === 'official');
  const registered = official.find((o) => o.type === 'spec_declared' && o.attributes.engineNumber);
  const regEngine = registered?.attributes.engineNumber ?? ws.input.identifiers.find((i) => i.type === 'engine_number')?.value;
  if (!regEngine) return [];

  const swaps = ws.included
    .filter((o) => o.type === 'component_replaced' && o.attributes.component === 'engine' && o.eventTime)
    .sort((a, b) => ms(a.eventTime!) - ms(b.eventTime!));
  const expectedAt = (time: string): { engine: string; basis: string | undefined } => {
    let engine = String(regEngine);
    let basis = registered?.id;
    for (const s of swaps) if (ms(s.eventTime!) <= ms(time)) { engine = String(s.attributes.newSerial); basis = s.id; }
    return { engine, basis };
  };

  const flags: Flag[] = [];
  for (const o of ws.included) {
    if (!o.eventTime) continue;
    let observed: unknown;
    let at = o.eventTime;
    if (o.type === 'inspection_result') observed = o.attributes.observedEngineNumber;
    else if (o.type === 'spec_declared' && ws.source(o).evidenceClass !== 'official') observed = o.attributes.engineNumber;
    else if (o.type === 'component_replaced' && o.attributes.component === 'engine' && o.attributes.oldSerial) {
      observed = o.attributes.oldSerial;
      at = new Date(ms(o.eventTime) - 1).toISOString(); // the old engine is what was fitted just before the swap
    }
    if (!observed) continue;
    const exp = expectedAt(at);
    if (norm(observed) !== norm(exp.engine)) {
      flags.push({
        check: 'undeclared_engine_change',
        severity: 'attention',
        observationIds: [exp.basis, o.id].filter((x): x is string => !!x),
        details: { expected: exp.engine, observed },
      });
    }
  }
  return flags;
}

/** C8 date_impossible: local events before import, or anything after deregistration. */
export function dateFlags(ws: WorkingSet): Flag[] {
  const flags: Flag[] = [];
  const imports = ws.included.filter((o) => o.type === 'import_recorded' && o.eventTime && ws.source(o).evidenceClass === 'official');
  const importObs = imports.sort((a, b) => ms(a.eventTime!) - ms(b.eventTime!))[0];
  const dereg = ws.included.find((o) => o.type === 'deregistered' && o.eventTime);
  for (const o of ws.included) {
    if (!o.eventTime || o === importObs) continue;
    const local = ['garage', 'inspection'].includes(ws.source(o).evidenceClass) || o.type === 'registration_issued';
    if (importObs && local && daysBetween(o.eventTime, importObs.eventTime!) > PARAMS.dateImpossibleGraceDays) {
      flags.push({ check: 'date_impossible', severity: 'attention', observationIds: [importObs.id, o.id], details: { reason: 'before_import' } });
    }
    if (dereg && o !== dereg && daysBetween(dereg.eventTime!, o.eventTime) > PARAMS.dateImpossibleGraceDays) {
      flags.push({ check: 'date_impossible', severity: 'attention', observationIds: [dereg.id, o.id], details: { reason: 'after_deregistration' } });
    }
  }
  return flags;
}

/** Expected colour at a time: latest official registered colour, then each repaint with a new colour (G8). */
export function colourTimeline(ws: WorkingSet): (time: string) => { colour?: string; basis?: string } {
  const events = ws.included
    .filter((o) => o.eventTime && (
      (o.type === 'spec_declared' && o.attributes.colour && ws.source(o).evidenceClass === 'official') ||
      (o.type === 'paint_work' && o.attributes.newColour)))
    .map((o) => ({ time: o.eventTime!, colour: String(o.type === 'paint_work' ? o.attributes.newColour : o.attributes.colour), id: o.id }))
    .sort((a, b) => ms(a.time) - ms(b.time));
  return (time) => {
    let out: { colour?: string; basis?: string } = {};
    for (const e of events) if (ms(e.time) <= ms(time)) out = { colour: e.colour, basis: e.id };
    return out;
  };
}

/** C9 spec_mismatch: observed colour vs expected (attention); make/model disagreement with official (serious). */
export function specFlags(ws: WorkingSet): Flag[] {
  const flags: Flag[] = [];
  const expected = colourTimeline(ws);
  for (const o of ws.included) {
    if (o.type !== 'inspection_result' || !o.eventTime || !o.attributes.observedColour) continue;
    const exp = expected(o.eventTime);
    if (exp.colour && !sameColour(exp.colour, o.attributes.observedColour)) {
      flags.push({
        check: 'spec_mismatch',
        severity: 'attention',
        observationIds: [exp.basis!, o.id],
        details: { field: 'colour', expected: exp.colour, observed: o.attributes.observedColour },
      });
    }
  }
  const officialSpec = ws.included.find((o) => o.type === 'spec_declared' && ws.source(o).evidenceClass === 'official');
  if (officialSpec) {
    for (const o of ws.included) {
      if (o.type !== 'spec_declared' || ws.source(o).evidenceClass === 'official') continue;
      for (const field of ['make', 'model'] as const) {
        const a = officialSpec.attributes[field];
        const b = o.attributes[field];
        if (a && b && !sameColour(a, b)) {
          flags.push({ check: 'spec_mismatch', severity: 'serious', observationIds: [officialSpec.id, o.id], details: { field, expected: a, observed: b } });
        }
      }
    }
  }
  return flags;
}

export function identityAlertFlags(alerts: IdentityAlert[] = []): Flag[] {
  return alerts.map((a) => ({
    check: a.check,
    severity: a.check === 'duplicate_suspected' ? 'info' : 'serious',
    observationIds: a.observationIds,
    details: a.relatedVehicleIds ? { relatedVehicleIds: a.relatedVehicleIds } : undefined,
  }));
}

export const flagsFor = (flags: Flag[], obs: EngineObservation): Flag[] => flags.filter((f) => f.observationIds.includes(obs.id));
