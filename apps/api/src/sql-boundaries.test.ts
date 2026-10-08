// D-081 rule 1: a module reads/writes ONLY its own Postgres schema. dependency-cruiser checks imports;
// this test checks the SQL inside each module, which import rules can't see.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'modules');
const SCHEMAS = ['iam', 'vehicle', 'ingest', 'obs', 'pii', 'trust', 'report', 'garage', 'inspection', 'dealer', 'notify', 'ref', 'community'];
/** Module folder → schemas it owns. */
const OWNS: Record<string, string[]> = {
  vehicle: ['vehicle'], ingest: ['ingest'], obs: ['obs', 'pii'], trust: ['trust'], report: ['report'], ref: ['ref'],
  iam: ['iam'], garage: ['garage'], inspection: ['inspection'], dealer: ['dealer'], notify: ['notify'], community: ['community'],
};
const SQL_REF = new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\\s+(${SCHEMAS.join('|')})\\.\\w+`, 'gi');

describe('module SQL boundaries (D-081)', () => {
  for (const mod of readdirSync(modulesDir)) {
    it(`${mod} only touches its own schema`, () => {
      const files = readdirSync(path.join(modulesDir, mod)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
      const violations: string[] = [];
      for (const f of files) {
        const src = readFileSync(path.join(modulesDir, mod, f), 'utf8');
        for (const m of src.matchAll(SQL_REF)) {
          if (!(OWNS[mod] ?? []).includes(m[1]!.toLowerCase())) violations.push(`${f}: ${m[0]}`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
