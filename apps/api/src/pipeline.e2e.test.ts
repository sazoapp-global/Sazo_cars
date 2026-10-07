// Definition of done for the first slice (API Outline §7): every scenario vehicle, loaded through the REAL
// pipeline into a brand-new database, produces exactly its expected outcome — and the HTTP views respect
// the exposure rules. Skipped when TEST_DATABASE_URL is not set.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { compareWithExpectations } from './seed/compare.js';
import { seedScenarios, type SeededVehicle } from './seed/scenario-seed.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('full pipeline with all scenario vehicles (e2e)', () => {
  const dbName = `sazo_parity_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const admin = new pg.Client({ connectionString: base });
  let app: INestApplication;
  let seeded: SeededVehicle[] = [];
  const ref = (id: string) => seeded.find((s) => s.scenarioId === id)!.vehicleRef;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString() }));
    await app.init();
    seeded = await seedScenarios(app);
  }, 600_000);

  afterAll(async () => {
    await app?.close();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('every scenario vehicle matches its expected outcome (Rule Set v1 §12)', async () => {
    expect(seeded).toHaveLength(27);
    const mismatches = await compareWithExpectations(app, seeded);
    expect(mismatches).toEqual([]);
  });

  it('S08: searching the cloned plate returns both vehicles with a serious banner', async () => {
    const res = await request(app.getHttpServer()).get('/v1/vehicles/search').query({ q: 'UAX 123A' }).expect(200);
    expect(res.body.outcome).toBe('multiple');
    expect(res.body.matches.map((m: { vehicleRef: string }) => m.vehicleRef).sort()).toEqual([ref('S08a'), ref('S08b')].sort());
  });

  it('public summary shows statuses only — no figures, sources or details (P-002)', async () => {
    const res = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S03')}/summary`).expect(200);
    for (const q of res.body.questions) expect(Object.keys(q).sort()).toEqual(['headlineKey', 'question', 'status']);
    expect(res.body.questions.find((q: { question: string }) => q.question === 'mileage').status).toBe('serious');
    expect(JSON.stringify(res.body)).not.toMatch(/121000|88400/);
  });

  it('S06: repair cost never reaches a consumer (confidential, P-007)', async () => {
    const ledger = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S06')}/evidence`).expect(200);
    expect(ledger.body.items.map((i: { type: string }) => i.type)).not.toContain('cost_recorded');
    expect(JSON.stringify(ledger.body)).not.toContain('4250000');
    const report = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S06')}/report`).expect(200);
    const facts = Object.fromEntries(report.body.facts.map((f: { key: string; value: unknown }) => [f.key, f.value]));
    expect(facts.current_engine_number).toBe('1NZ-B222222');
    expect(facts.registered_engine_number).toBe('1NZ-A111111');
  });

  it('S12: finance shows as status only — no lender details (O-001 default)', async () => {
    const ledger = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S12')}/evidence`).expect(200);
    const lien = ledger.body.items.find((i: { type: string }) => i.type === 'finance_lien_registered');
    expect(lien.attributes).toEqual({});
    const report = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S12')}/report`).expect(200);
    expect(report.body.facts.find((f: { key: string }) => f.key === 'finance_status').value).toBe('active');
  });

  it('S23: the mileage typo stays in the ledger, excluded as corrected (append-only, D-020)', async () => {
    const ledger = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S23')}/evidence`).expect(200);
    const typo = ledger.body.items.find((i: { attributes: { km?: number } }) => i.attributes.km === 1_540_000);
    expect(typo).toMatchObject({ excluded: true, exclusionReason: 'corrected' });
  });

  it('a replayed submission (same Idempotency-Key, same body) is stored once (X5)', async () => {
    const body = { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'ZSU60-0071234' }, records: [
      { type: 'service_performed', attributes: { items: ['wiper_blades'] }, time: { at: '2026-09-30T10:00:00Z', precision: 'day' } }] }] };
    const key = '0192a000-0000-7000-8000-0000000000aa';
    const first = await request(app.getHttpServer()).post('/v1/ingest/submissions').set('Idempotency-Key', key).set('X-Source-Code', 'DLR').send(body).expect(202);
    const second = await request(app.getHttpServer()).post('/v1/ingest/submissions').set('Idempotency-Key', key).set('X-Source-Code', 'DLR').send(body).expect(202);
    expect(second.body.submissionId).toBe(first.body.submissionId);
    expect(first.body.items[0]).not.toHaveProperty('vehicleId');
    await request(app.getHttpServer()).post('/v1/ingest/submissions').set('Idempotency-Key', key).set('X-Source-Code', 'DLR')
      .send({ ...body, schemaVersion: 2 }).expect(409);
  });

  it('a garage job without the required odometer photo is rejected (D-057)', async () => {
    const res = await request(app.getHttpServer()).post('/v1/ingest/submissions')
      .set('Idempotency-Key', '0192a000-0000-7000-8000-0000000000bb').set('X-Source-Code', 'GAR-MUT')
      .send({ schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'NZT260-3048271' }, records: [
        { type: 'odometer_reading', attributes: { km: 152000, originalValue: 152000, originalUnit: 'km' }, time: { at: '2026-09-30T10:00:00Z', precision: 'day' } }] }] })
      .expect(202);
    expect(res.body.status).toBe('rejected');
    expect(res.body.items[0].errors[0].code).toBe('evidence_required');
  });
});
