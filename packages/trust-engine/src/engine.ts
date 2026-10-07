// evaluateVehicle(): Rule Set v1 end to end. Pure function — same input, same output (G4).
import type { ConflictTopic } from '@sazo/contracts';
import { dateFlags, engineFlags, identityAlertFlags, specFlags } from './checks.js';
import { baseConfidence, finalConfidence } from './confidence.js';
import { deriveFacts } from './facts.js';
import { buildMileageSeries, mileageFlags, usageTimeline } from './mileage.js';
import { PARAMS, RULE_SET_VERSION } from './params.js';
import { answerQuestions } from './questions.js';
import { recordConfidence, vehicleHealth } from './scores.js';
import type { Assessment, ConflictCandidate, EngineContext, EvaluationResult, Flag, VehicleInput } from './types.js';
import { buildWorkingSet } from './working-set.js';

const TOPIC: Partial<Record<Flag['check'], ConflictTopic>> = {
  mileage_decrease: 'mileage',
  undeclared_engine_change: 'identity',
  plate_vin_mismatch: 'identity',
  cloned_plate_suspected: 'identity',
  identity_collision: 'identity',
  spec_mismatch: 'spec',
};

export function evaluateVehicle(input: VehicleInput, ctx: EngineContext): EvaluationResult {
  const ws = buildWorkingSet(input, ctx);

  // Mileage structure and usage are needed by both confidence (corroboration) and checks.
  const series = buildMileageSeries(ws.included);
  const usageAt = usageTimeline(ws.included);

  // Phase B: base confidence, then checks, then penalties.
  const bases = new Map(ws.included.map((o) => [o.id, baseConfidence(o, ws, series)]));
  const flags: Flag[] = [
    ...mileageFlags(series, usageAt),
    ...engineFlags(ws),
    ...dateFlags(ws),
    ...specFlags(ws),
    ...identityAlertFlags(input.identityAlerts),
  ];

  const assessments: Assessment[] = [];
  const conf = new Map<string, number>();
  for (const o of ws.all) {
    const reason = ws.exclusions.get(o.id);
    if (reason) {
      assessments.push({ observationId: o.id, confidence: 0, weak: true, excluded: true, exclusionReason: reason, factors: {} });
      continue;
    }
    const { confidence, factors } = finalConfidence(o, bases.get(o.id)!, flags);
    conf.set(o.id, confidence);
    assessments.push({ observationId: o.id, confidence, weak: confidence < PARAMS.weakThreshold, excluded: false, factors });
  }
  const confidence = (id: string) => conf.get(id) ?? 0;
  const qualifying = ws.included.filter((o) => confidence(o.id) >= PARAMS.weakThreshold);

  // Conflicts (Rule Set §5): one per topic per vehicle.
  const closed = new Set(input.closedConflictKeys ?? []);
  const byTopic = new Map<ConflictTopic, ConflictCandidate>();
  const addConflict = (topic: ConflictTopic, ids: string[], check: ConflictCandidate['openedByCheck'], serious: boolean) => {
    const c = byTopic.get(topic) ?? { key: topic, topic, observationIds: [], openedByCheck: check, serious: false, open: !closed.has(topic) };
    c.observationIds = [...new Set([...c.observationIds, ...ids])];
    c.serious ||= serious;
    byTopic.set(topic, c);
  };
  for (const f of flags) {
    const topic = TOPIC[f.check];
    if (!topic) continue;
    if (f.severity === 'serious' || f.check === 'undeclared_engine_change' || f.check === 'spec_mismatch') {
      addConflict(topic, f.observationIds, f.check, f.severity === 'serious');
    }
  }
  const disputedEventIds = new Set<string>();
  for (const a of input.attestations ?? []) {
    if (a.response !== 'disputed') continue;
    const ids = ws.included.filter((o) => o.id === a.observationId || (a.eventId && o.eventId === a.eventId)).map((o) => o.id);
    if (a.eventId) disputedEventIds.add(a.eventId);
    addConflict('care', ids, 'disputed_attestation', false);
  }
  const conflicts = [...byTopic.values()];

  const facts = deriveFacts({ ws, series, qualifying, confidence });
  const questions = answerQuestions({ ws, series, flags, conflicts, qualifying, confidence, facts, disputedEventIds });
  const rc = recordConfidence(ws, qualifying, conflicts);
  const health = vehicleHealth(ws, qualifying, facts, questions, rc.level);

  return {
    vehicleId: input.vehicleId,
    asOf: ctx.asOf,
    ruleSetVersion: RULE_SET_VERSION,
    assessments,
    flags,
    conflicts,
    facts,
    questions,
    recordConfidence: rc,
    health,
  };
}
