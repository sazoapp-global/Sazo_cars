// Compare each seeded vehicle's stored trust verdict with its scenario's expected outcome.
// Used by the parity test and by `npm run seed:check -w @sazo/api`.
import type { INestApplicationContext } from '@nestjs/common';
import { SCENARIOS } from '@sazo/scenarios';
import { TrustService } from '../modules/trust/index.js';
import type { SeededVehicle } from './scenario-seed.js';

export interface Mismatch { scenarioId: string; field: string; expected: unknown; actual: unknown }

export async function compareWithExpectations(app: INestApplicationContext, seeded: SeededVehicle[]): Promise<Mismatch[]> {
  const trust = app.get(TrustService);
  const out: Mismatch[] = [];
  for (const s of seeded) {
    const sc = SCENARIOS.find((x) => x.id === s.scenarioId)!;
    const snap = await trust.current(s.vehicleId);
    if (!snap) {
      out.push({ scenarioId: s.scenarioId, field: 'snapshot', expected: 'present', actual: 'missing' });
      continue;
    }
    for (const [q, status] of Object.entries(sc.expected.questions)) {
      const got = snap.questions.find((x) => x.question === q)?.status;
      if (got !== status) out.push({ scenarioId: s.scenarioId, field: q, expected: status, actual: got });
    }
    if (snap.recordConfidence.level !== sc.expected.recordConfidence) {
      out.push({ scenarioId: s.scenarioId, field: 'recordConfidence', expected: sc.expected.recordConfidence, actual: snap.recordConfidence.level });
    }
    const h = sc.expected.health;
    if (h === 'insufficient' && !snap.health?.insufficient) out.push({ scenarioId: s.scenarioId, field: 'health', expected: h, actual: snap.health?.score });
    if (typeof h === 'number' && snap.health?.score !== h) out.push({ scenarioId: s.scenarioId, field: 'health', expected: h, actual: snap.health?.score });
    for (const [k, v] of Object.entries(sc.expected.facts ?? {})) {
      if (JSON.stringify(snap.facts[k]?.value) !== JSON.stringify(v)) out.push({ scenarioId: s.scenarioId, field: `fact.${k}`, expected: v, actual: snap.facts[k]?.value });
    }
  }
  return out;
}
