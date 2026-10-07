// The seven buyer questions (Rule Set §7). Rules are checked top to bottom; the first match wins.
import type { Question, QuestionStatus } from '@sazo/contracts';
import type { MileageSeries } from './mileage.js';
import { PARAMS } from './params.js';
import { monthsBetween, ms } from './time.js';
import type { ConflictCandidate, Coverage, EngineObservation, Fact, Flag, QuestionAnswer } from './types.js';
import type { WorkingSet } from './working-set.js';

export interface QuestionInputs {
  ws: WorkingSet;
  series: MileageSeries;
  flags: Flag[];
  conflicts: ConflictCandidate[];
  qualifying: EngineObservation[];
  confidence: (id: string) => number;
  facts: Record<string, Fact>;
  disputedEventIds: Set<string>;
}

const answer = (
  question: Question,
  status: QuestionStatus,
  reason: string,
  basis: EngineObservation[] | string[] = [],
  params?: Record<string, unknown>,
  notes: QuestionAnswer['notes'] = [],
): QuestionAnswer => ({
  question,
  status,
  headlineKey: `${question}.${status}.${reason}`,
  ...(params ? { params } : {}),
  notes,
  basis: basis.map((b) => (typeof b === 'string' ? b : b.id)),
});

function coverageApplies(cov: Coverage, ws: WorkingSet, sourceId: string): boolean {
  const asOf = ms(ws.ctx.asOf);
  if (ms(cov.from) > asOf || (cov.to && ms(cov.to) < asOf)) return false;
  const officialReg = ws.included.some((o) => o.type === 'registration_issued' && ws.source(o).evidenceClass === 'official');
  switch (cov.scope) {
    case 'all_registered_vehicles':
      return officialReg;
    case 'imports_since': {
      const imp = ws.included.find((o) => o.type === 'import_recorded' && o.eventTime);
      return !!imp && ms(imp.eventTime!) >= ms(cov.from);
    }
    default: // own_customers / own_fleet / own_stock: the source has dealt with this vehicle
      return ws.included.some((o) => o.sourceId === sourceId);
  }
}

/** Is any source of this domain able to vouch for a negative ("none found") on this vehicle? (G2) */
function covered(ws: WorkingSet, domain: string): boolean {
  for (const s of ws.ctx.sources.values()) {
    if (s.domain !== domain || s.status === 'retired') continue;
    if (s.coverage.some((c) => coverageApplies(c, ws, s.id))) return true;
  }
  return false;
}

export function answerQuestions(q: QuestionInputs): Record<Question, QuestionAnswer> {
  const { ws, series, flags, conflicts, qualifying, confidence, facts } = q;
  const asOf = ws.ctx.asOf;
  const of = (...types: string[]) => qualifying.filter((o) => types.includes(o.type));
  const openConflict = (topic: string) => conflicts.some((c) => c.topic === topic && c.open);
  const flagged = (check: string, sev?: string) => flags.filter((f) => f.check === check && (!sev || f.severity === sev));

  // ---------- identity
  const identity = ((): QuestionAnswer => {
    const notes: QuestionAnswer['notes'] = [];
    const swap = of('component_replaced').find((o) => o.attributes.component === 'engine');
    if (swap) notes.push({ key: 'identity.note.engine_replaced', params: { on: swap.eventTime?.slice(0, 10) } });
    const repaint = of('paint_work').find((o) => (o.attributes.areas as string[]).includes('full_body') && o.attributes.newColour);
    if (repaint) notes.push({ key: 'identity.note.full_repaint', params: { from: repaint.attributes.oldColour, to: repaint.attributes.newColour } });

    const identitySerious = flags.filter((f) =>
      ['plate_vin_mismatch', 'cloned_plate_suspected', 'identity_collision'].includes(f.check) ||
      (f.check === 'spec_mismatch' && f.severity === 'serious'));
    if (identitySerious.length && openConflict('identity')) {
      return answer('identity', 'serious', identitySerious[0]!.check, identitySerious[0]!.observationIds, undefined, notes);
    }
    const engine = flagged('undeclared_engine_change');
    if (engine.length) return answer('identity', 'attention', 'undeclared_engine_change', engine[0]!.observationIds, undefined, notes);
    const colour = flagged('spec_mismatch', 'attention');
    if (colour.length && openConflict('spec')) return answer('identity', 'attention', 'colour_mismatch', colour[0]!.observationIds, colour[0]!.details, notes);
    if (ws.input.status === 'provisional') return answer('identity', 'attention', 'provisional', [], undefined, notes);
    const anchor = ws.input.identifiers.some((i) => i.type === 'vin' || i.type === 'chassis_number');
    const official = qualifying.filter((o) => ws.source(o).evidenceClass === 'official' &&
      ['registration_issued', 'import_recorded', 'identifier_assigned', 'customs_cleared', 'spec_declared'].includes(o.type));
    if (anchor && official.length) return answer('identity', 'verified', 'official_match', official, undefined, notes);
    return answer('identity', 'not_available', 'no_official_record', [], undefined, notes);
  })();

  // ---------- care
  const care = ((): QuestionAnswer => {
    const serviceObs = qualifying.filter((o) => {
      const d = ws.source(o).domain;
      return (d === 'garage' && o.type !== 'cost_recorded') ||
        (d === 'rental' && ['service_performed', 'repair_performed', 'component_replaced'].includes(o.type));
    });
    if (!serviceObs.length) {
      const anyDisputed = [...q.disputedEventIds].length > 0;
      return anyDisputed ? answer('care', 'attention', 'disputed') : answer('care', 'not_available', 'no_service_records');
    }
    // One visit = one event (a garage job with several observations counts once).
    const visits = new Map<string, { time: string; conf: number[] }>();
    for (const o of serviceObs) {
      if (!o.eventTime) continue;
      const key = o.eventId ?? o.id;
      const v = visits.get(key) ?? { time: o.eventTime, conf: [] };
      v.conf.push(confidence(o.id));
      visits.set(key, v);
    }
    const all = [...visits.values()];
    const recent = all.filter((v) => monthsBetween(v.time, asOf) <= PARAMS.care.windowMonths);
    const latest = all.reduce((a, b) => (ms(b.time) > ms(a.time) ? b : a));
    const avg = recent.length ? recent.flatMap((v) => v.conf).reduce((a, b) => a + b, 0) / recent.flatMap((v) => v.conf).length : 0;
    if (q.disputedEventIds.size && openConflict('care')) return answer('care', 'attention', 'disputed', serviceObs);
    if (recent.length === 1) return answer('care', 'attention', 'single_recent_service', serviceObs);
    if (monthsBetween(latest.time, asOf) > PARAMS.care.gapMonths) return answer('care', 'attention', 'service_gap', serviceObs, { lastService: latest.time.slice(0, 10) });
    if (recent.length >= 2 && avg >= PARAMS.care.minAvgConfidence) return answer('care', 'verified', 'regular_services', serviceObs, { visits: recent.length });
    return answer('care', 'attention', 'low_confidence_records', serviceObs);
  })();

  // ---------- damage
  const damage = ((): QuestionAnswer => {
    const structural = of('damage_assessed').filter((o) => o.attributes.structural === true);
    const totalLoss = of('total_loss_declared');
    const flood = of('flood_damage_reported');
    if (totalLoss.length) return answer('damage', 'serious', 'total_loss', totalLoss, { rebuilt: facts.title_status?.value === 'rebuilt' });
    if (flood.length) return answer('damage', 'serious', 'flood', flood);
    if (structural.length) return answer('damage', 'serious', 'structural', structural);
    if (openConflict('damage')) return answer('damage', 'serious', 'conflict');
    const accidents = of('accident_reported', 'insurance_claim');
    if (accidents.length) return answer('damage', 'attention', 'non_structural', accidents);
    const policeCovered = covered(ws, 'police');
    const insurerCovered = covered(ws, 'insurance');
    if (policeCovered || insurerCovered) {
      return answer('damage', 'verified', 'none_found', [], { checked: [policeCovered && 'police', insurerCovered && 'insurer'].filter(Boolean) });
    }
    return answer('damage', 'not_available', 'no_coverage');
  })();

  // ---------- mileage
  const mileage = ((): QuestionAnswer => {
    const decrease = flagged('mileage_decrease');
    if (decrease.length) return answer('mileage', 'serious', 'decrease', decrease[0]!.observationIds, decrease[0]!.details);
    const usable = new Set(qualifying.map((o) => o.id));
    const readings = series.readings.filter((r) => usable.has(r.obsId));
    const rate = flagged('implausible_mileage_rate');
    if (rate.length) return answer('mileage', 'attention', 'implausible_rate', rate[0]!.observationIds, rate[0]!.details);
    if (series.segments > 1) {
      return answer('mileage', 'attention', 'odometer_replaced', series.swaps.map((s) => s.obsId),
        { replacedOn: series.swaps.at(-1)!.time.slice(0, 10), estimatedTotalKm: facts.current_mileage_km?.value });
    }
    if (!readings.length) return answer('mileage', 'not_available', 'no_readings');
    if (readings.length === 1) return answer('mileage', 'attention', 'single_reading', [readings[0]!.obsId]);
    const span = monthsBetween(readings[0]!.time, readings.at(-1)!.time);
    const strong = readings.some((r) => confidence(r.obsId) >= 0.6);
    if (span >= PARAMS.mileage.verifiedMinSpanMonths && strong) {
      return answer('mileage', 'verified', 'consistent', readings.map((r) => r.obsId), { readings: readings.length });
    }
    return answer('mileage', 'attention', 'short_history', readings.map((r) => r.obsId));
  })();

  // ---------- provenance
  const provenance = ((): QuestionAnswer => {
    const usage = (facts.usage_history?.value as string[] | undefined) ?? [];
    const special = usage.find((u) => ['rental', 'commercial', 'psv'].includes(u));
    if (special) return answer('provenance', 'attention', `usage_${special}`, facts.usage_history!.supporting);
    const title = facts.title_status?.value;
    if (title === 'rebuilt' || title === 'total_loss') return answer('provenance', 'attention', `title_${title}`, facts.title_status!.supporting);
    const exportRollback = flagged('mileage_decrease').find((f) => f.details?.involvesExport);
    if (exportRollback) return answer('provenance', 'attention', 'export_mileage_conflict', exportRollback.observationIds);
    const imports = of('import_recorded').filter((o) => ws.source(o).evidenceClass === 'official');
    const newReg = of('registration_issued').filter((o) => o.attributes.newVehicle === true);
    if (imports.length || newReg.length) return answer('provenance', 'verified', imports.length ? 'import_recorded' : 'new_vehicle', [...imports, ...newReg]);
    return answer('provenance', 'not_available', 'no_origin_record');
  })();

  // ---------- legal & financial
  const legal = ((): QuestionAnswer => {
    if (facts.stolen_status?.value === 'open') return answer('legal_financial', 'serious', 'stolen_open', facts.stolen_status.supporting);
    if (facts.impound_status?.value === 'impounded') return answer('legal_financial', 'serious', 'impounded', facts.impound_status.supporting);
    if (facts.finance_status?.value === 'active') return answer('legal_financial', 'attention', 'finance_active', facts.finance_status.supporting);
    const recovered = of('stolen_recovered').find((o) => o.eventTime && monthsBetween(o.eventTime, asOf) <= PARAMS.legal.recoveryWindowMonths);
    if (facts.stolen_status?.value === 'recovered' && recovered) {
      return answer('legal_financial', 'attention', 'stolen_recovered', facts.stolen_status.supporting, { recoveredOn: recovered.eventTime!.slice(0, 10) });
    }
    const released = of('released').find((o) => o.eventTime && monthsBetween(o.eventTime, asOf) <= PARAMS.legal.impoundReleaseWindowMonths);
    if (released) return answer('legal_financial', 'attention', 'recently_released', [released]);
    if (covered(ws, 'police') && covered(ws, 'finance')) {
      const notes: QuestionAnswer['notes'] = [];
      if (facts.finance_status?.value === 'cleared') notes.push({ key: 'legal.note.previous_loan_cleared' });
      if (facts.stolen_status?.value === 'recovered') notes.push({ key: 'legal.note.past_stolen_recovered' });
      return answer('legal_financial', 'verified', 'none_active', [], undefined, notes);
    }
    return answer('legal_financial', 'not_available', 'no_coverage');
  })();

  // ---------- valuation (status only; the range comes from the Intelligence module)
  const valuation = ((): QuestionAnswer => {
    const n = ws.ctx.comparablesCount ?? 0;
    if (n < PARAMS.valuation.attentionMin) return answer('valuation', 'not_available', 'too_few_comparables', [], { comparables: n });
    if (facts.title_status?.value === 'rebuilt') return answer('valuation', 'attention', 'rebuilt_adjusted', [], { comparables: n });
    if (n < PARAMS.valuation.verifiedMin) return answer('valuation', 'attention', 'few_comparables', [], { comparables: n });
    return answer('valuation', 'verified', 'comparables', [], { comparables: n });
  })();

  return { identity, care, damage, mileage, provenance, legal_financial: legal, valuation };
}
