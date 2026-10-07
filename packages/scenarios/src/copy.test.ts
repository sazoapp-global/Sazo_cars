// Every answer the engine gives for the scenario vehicles has plain-language wording, and none of the
// wording guarantees anything (P-006).
import { ALL_HEADLINE_KEYS, BANNED_PHRASES, HEALTH_FACTORS, headline, summaryLine } from '@sazo/contracts';
import { evaluateVehicle } from '@sazo/trust-engine';
import { describe, expect, it } from 'vitest';
import { AS_OF, SCENARIOS, sourceMap } from './index.js';

const results = SCENARIOS.map((s) => evaluateVehicle(s.vehicle, { asOf: AS_OF, sources: sourceMap(s.sourceOverrides), comparablesCount: s.comparablesCount }));

describe('report wording (P-006)', () => {
  it('has a sentence for every headline, note and health factor the scenarios produce', () => {
    const missing = new Set<string>();
    for (const r of results) {
      for (const q of Object.values(r.questions)) {
        if (!ALL_HEADLINE_KEYS.includes(q.headlineKey)) missing.add(q.headlineKey);
        for (const note of q.notes) if (!ALL_HEADLINE_KEYS.includes(note.key)) missing.add(note.key);
      }
      for (const d of r.health.deductions) if (!HEALTH_FACTORS[d.key]) missing.add(d.key);
    }
    expect([...missing]).toEqual([]);
  });

  it('renders every scenario answer without gaps like "undefined" or "NaN"', () => {
    for (const r of results) {
      for (const q of Object.values(r.questions)) {
        const text = headline(q.headlineKey, q.params);
        expect(text, q.headlineKey).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  });

  it('never uses guarantee language', () => {
    for (const key of ALL_HEADLINE_KEYS) {
      const text = headline(key, { comparables: 3, readings: 4, visits: 2, checked: ['police'], kmPerYear: 70000, earlierKm: 120000, laterKm: 98000, lastService: '2024-01-02' });
      for (const banned of BANNED_PHRASES) expect(text, key).not.toMatch(banned);
    }
  });

  it('the public summary wording contains no figures (P-002)', () => {
    for (const key of ALL_HEADLINE_KEYS) {
      const text = summaryLine(key);
      expect(text, key).not.toMatch(/\d|undefined|NaN/);
      for (const banned of BANNED_PHRASES) expect(text, key).not.toMatch(banned);
    }
  });
});
