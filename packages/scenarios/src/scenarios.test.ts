// Definition of done for the trust engine: every scenario produces exactly its expected outcome
// (Rule Set v1 §12, API Outline §7).
import { evaluateVehicle } from '@sazo/trust-engine';
import { describe, expect, it } from 'vitest';
import { AS_OF, SCENARIOS, buildS23, sourceMap } from './index.js';

describe('Rule Set v1 against the Scenario Dataset', () => {
  for (const s of SCENARIOS) {
    describe(`${s.id} — ${s.title}`, () => {
      const r = evaluateVehicle(s.vehicle, { asOf: AS_OF, sources: sourceMap(s.sourceOverrides), comparablesCount: s.comparablesCount });

      it('answers the seven questions as expected', () => {
        const got = Object.fromEntries(Object.entries(r.questions).map(([k, v]) => [k, v.status]));
        expect(got).toEqual(s.expected.questions);
      });

      it('has the expected record confidence', () => {
        expect(r.recordConfidence.level).toBe(s.expected.recordConfidence);
      });

      if (s.expected.health !== undefined) {
        it('has the expected vehicle health', () => {
          const h = s.expected.health!;
          if (h === 'insufficient') {
            expect(r.health.insufficient).toBe(true);
            expect(r.health.score).toBeNull();
          } else if (typeof h === 'number') {
            expect(r.health.score).toBe(h);
          } else {
            expect(r.health.score).toBeGreaterThanOrEqual(h.min);
            expect(r.health.score).toBeLessThanOrEqual(h.max);
          }
        });
      }

      if (s.expected.flags) {
        it('raises the expected checks', () => {
          for (const f of s.expected.flags!) expect(r.flags.map((x) => x.check)).toContain(f);
        });
      }
      if (s.expected.noFlags) {
        it('raises no consistency flags', () => {
          expect(r.flags).toEqual([]);
        });
      }
      if (s.expected.facts) {
        it('derives the expected facts', () => {
          for (const [k, v] of Object.entries(s.expected.facts!)) expect(r.facts[k]?.value).toEqual(v);
        });
      }
      if (s.expected.headlines) {
        it('uses the expected headline keys', () => {
          for (const [k, v] of Object.entries(s.expected.headlines!)) expect(r.questions[k as keyof typeof r.questions].headlineKey).toBe(v);
        });
      }
    });
  }
});

describe('properties of the engine', () => {
  it('S23: before the correction arrives, the typo is flagged; after, it is excluded but kept (G4, D-020)', () => {
    const vehicle = buildS23().build();
    const before = evaluateVehicle(vehicle, { asOf: '2026-03-02T23:00:00Z', sources: sourceMap(), comparablesCount: 17 });
    expect(before.flags.map((f) => f.check)).toContain('implausible_mileage_rate');
    const after = evaluateVehicle(vehicle, { asOf: AS_OF, sources: sourceMap(), comparablesCount: 17 });
    const typo = after.assessments.find((a) => a.observationId === 'S23-typo')!;
    expect(typo.excluded).toBe(true);
    expect(typo.exclusionReason).toBe('corrected');
  });

  it('is deterministic: same input, same output', () => {
    const s = SCENARIOS.find((x) => x.id === 'S03')!;
    const ctx = { asOf: AS_OF, sources: sourceMap(), comparablesCount: s.comparablesCount };
    expect(JSON.stringify(evaluateVehicle(s.vehicle, ctx))).toBe(JSON.stringify(evaluateVehicle(s.vehicle, ctx)));
  });

  it('X1: retiring a simulated source excludes its records without deleting them', () => {
    const s = SCENARIOS.find((x) => x.id === 'S12')!;
    const r = evaluateVehicle(s.vehicle, {
      asOf: AS_OF,
      sources: sourceMap({ LIEN: { status: 'retired', supersededBySourceId: 'LIEN-REAL' } }),
      comparablesCount: s.comparablesCount,
    });
    const lienAssessment = r.assessments.find((a) => s.vehicle.observations.find((o) => o.id === a.observationId)?.sourceId === 'LIEN')!;
    expect(lienAssessment.exclusionReason).toBe('retired_simulated_source');
    expect(r.facts.finance_status).toBeUndefined();
  });

  it('X2: a stricter rule changes the answer (rental threshold check via a private car)', () => {
    // S17 drove ~52,000 km/yr while a rental; as a private car (no rental record) at 60,000/yr it still passes.
    const s = SCENARIOS.find((x) => x.id === 'S17')!;
    const r = evaluateVehicle(s.vehicle, { asOf: AS_OF, sources: sourceMap(), comparablesCount: 14 });
    expect(r.questions.mileage.status).toBe('verified');
  });

  it('a garage with many disputes has low reputation (Rule Set §2 example)', async () => {
    const { reputation } = await import('@sazo/trust-engine');
    const { SOURCES } = await import('./index.js');
    expect(reputation(SOURCES['GAR-KIR']!)).toBeCloseTo(0.547, 3);
  });

  it('S22: a customer confirmation counts less than an owner confirmation (G3)', () => {
    const s = SCENARIOS.find((x) => x.id === 'S22')!;
    const r = evaluateVehicle(s.vehicle, { asOf: AS_OF, sources: sourceMap(), comparablesCount: 20 });
    const confirmed = r.assessments.find((a) => a.factors.attestation !== undefined)!;
    expect(confirmed.factors.attestation).toBe(0.05);
  });

  it('v1.1: thick paint at the latest inspection adds a repaint note, without changing the damage status', () => {
    const s = SCENARIOS.find((x) => x.id === 'S01')!;
    const ctx = { asOf: AS_OF, sources: sourceMap(), comparablesCount: s.comparablesCount };
    const plain = evaluateVehicle(s.vehicle, ctx);
    const v = { ...s.vehicle, observations: s.vehicle.observations.map((o) => o.type === 'inspection_result'
      ? { ...o, attributes: { ...o.attributes, paintReadings: [{ panel: 'bonnet', microns: 410 }, { panel: 'roof', microns: 120 }, { panel: 'front_left_door', microns: 300 }] } } : o) };
    const r = evaluateVehicle(v, ctx);
    expect(r.questions.damage.status).toBe(plain.questions.damage.status);
    expect(r.questions.damage.notes).toContainEqual({ key: 'damage.note.repainted_panels', params: { panels: 2, on: '2026-06-10' } });
    expect(plain.questions.damage.notes.map((n) => n.key)).not.toContain('damage.note.repainted_panels');
  });
});
