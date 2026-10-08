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
import { AuthService, IamService } from './modules/iam/index.js';
import { IngestionService } from './modules/ingest/index.js';
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
  let auth: Record<string, string> = {};
  const ref = (id: string) => seeded.find((s) => s.scenarioId === id)!.vehicleRef;

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString() }));
    await app.init();
    seeded = await seedScenarios(app);
    const adminId = await app.get(IamService).ensureUser('+256700000998', 'Pipeline Admin', 'sazo_admin');
    auth = { Authorization: `Bearer ${(await app.get(AuthService).issueTokens(adminId)).accessToken}` };
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
    const ledger = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S06')}/evidence`).set(auth).expect(200);
    expect(ledger.body.items.map((i: { type: string }) => i.type)).not.toContain('cost_recorded');
    expect(JSON.stringify(ledger.body)).not.toContain('4250000');
    const report = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S06')}/report`).set(auth).expect(200);
    const facts = Object.fromEntries(report.body.facts.map((f: { key: string; value: unknown }) => [f.key, f.value]));
    expect(facts.current_engine_number).toBe('1NZ-B222222');
    expect(facts.registered_engine_number).toBe('1NZ-A111111');
  });

  it('S12: finance shows as status only — no lender details (O-001 default)', async () => {
    const ledger = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S12')}/evidence`).set(auth).expect(200);
    const lien = ledger.body.items.find((i: { type: string }) => i.type === 'finance_lien_registered');
    expect(lien.attributes).toEqual({});
    const report = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S12')}/report`).set(auth).expect(200);
    expect(report.body.facts.find((f: { key: string }) => f.key === 'finance_status').value).toBe('active');
  });

  it('S23: the mileage typo stays in the ledger, excluded as corrected (append-only, D-020)', async () => {
    const ledger = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S23')}/evidence`).set(auth).expect(200);
    const typo = ledger.body.items.find((i: { attributes: { km?: number } }) => i.attributes.km === 1_540_000);
    expect(typo).toMatchObject({ excluded: true, exclusionReason: 'corrected' });
  });

  it('a replayed submission (same Idempotency-Key, same body) is stored once (X5)', async () => {
    const body = { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'ZSU60-0071234' }, records: [
      { type: 'service_performed', attributes: { items: ['wiper_blades'] }, time: { at: '2026-09-30T10:00:00Z', precision: 'day' } }] }] };
    const key = '0192a000-0000-7000-8000-0000000000aa';
    const first = await request(app.getHttpServer()).post('/v1/ingest/submissions').set(auth).set('Idempotency-Key', key).set('X-Source-Code', 'DLR').send(body).expect(202);
    const second = await request(app.getHttpServer()).post('/v1/ingest/submissions').set(auth).set('Idempotency-Key', key).set('X-Source-Code', 'DLR').send(body).expect(202);
    expect(second.body.submissionId).toBe(first.body.submissionId);
    expect(first.body.items[0]).not.toHaveProperty('vehicleId');
    await request(app.getHttpServer()).post('/v1/ingest/submissions').set(auth).set('Idempotency-Key', key).set('X-Source-Code', 'DLR')
      .send({ ...body, schemaVersion: 2 }).expect(409);
  });

  it('a garage job without the required odometer photo is rejected (D-057)', async () => {
    const res = await request(app.getHttpServer()).post('/v1/ingest/submissions').set(auth)
      .set('Idempotency-Key', '0192a000-0000-7000-8000-0000000000bb').set('X-Source-Code', 'GAR-MUT')
      .send({ schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'NZT260-3048271' }, records: [
        { type: 'odometer_reading', attributes: { km: 152000, originalValue: 152000, originalUnit: 'km' }, time: { at: '2026-09-30T10:00:00Z', precision: 'day' } }] }] })
      .expect(202);
    expect(res.body.status).toBe('rejected');
    expect(res.body.items[0].errors[0].code).toBe('evidence_required');
  });

  it('the full report needs a sign-in; the public summary does not', async () => {
    await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S06')}/report`).expect(401);
    await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S06')}/summary`).expect(200);
  });

  it('the identity queue shows the reviewer decision for the S24 match', async () => {
    const res = await request(app.getHttpServer()).get('/v1/admin/resolutions').query({ outcome: 'matched' }).set(auth).expect(200);
    const reviewed = res.body.items.filter((d: { rule: string }) => d.rule === 'reviewer_match');
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]).toMatchObject({ decidedBy: 'reviewer', matchedVehicleRef: ref('S24') });
    expect(JSON.stringify(res.body)).not.toMatch(/"matchedVehicleId"/);
    const pending = await request(app.getHttpServer()).get('/v1/admin/resolutions').query({ outcome: 'ambiguous' }).set(auth).expect(200);
    expect(pending.body.items).toEqual([]);
  });

  it('a buyer saves cars, compares them, and shares a frozen report', async () => {
    const buyerId = await app.get(IamService).ensureUser('+256700000996', 'Pipeline Buyer');
    const buyer = { Authorization: `Bearer ${(await app.get(AuthService).issueTokens(buyerId)).accessToken}` };
    const http = request(app.getHttpServer());
    await http.post('/v1/me/saved-checks').set(buyer).send({ vehicleRef: ref('S01') }).expect(204);
    await http.post('/v1/me/saved-checks').set(buyer).send({ vehicleRef: ref('S01') }).expect(204); // idempotent
    await http.post('/v1/me/saved-checks').set(buyer).send({ vehicleRef: ref('S03') }).expect(204);
    const saved = await http.get('/v1/me/saved-checks').set(buyer).expect(200);
    expect(saved.body.items.map((i: { vehicleRef: string }) => i.vehicleRef)).toEqual([ref('S03'), ref('S01')]);
    expect(saved.body.items[0].summary.questions).toHaveLength(7);
    await http.delete(`/v1/me/saved-checks/${ref('S03')}`).set(buyer).expect(204);
    expect((await http.get(`/v1/me/saved-checks/${ref('S03')}`).set(buyer).expect(200)).body).toEqual({ saved: false });

    const cmp = await http.get('/v1/vehicles/compare').query({ refs: `${ref('S01')},${ref('S03')}` }).set(buyer).expect(200);
    expect(cmp.body.vehicles).toHaveLength(2);
    expect(cmp.body.differingQuestions).toContain('mileage');
    await http.get('/v1/vehicles/compare').query({ refs: ref('S01') }).set(buyer).expect(400);

    const snap = await http.post(`/v1/vehicles/${ref('S06')}/snapshots`).set(buyer).send({}).expect(201);
    expect(snap.body.snapshotRef).toMatch(/^SZR-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const shared = await http.get(`/v1/shared/${snap.body.shareToken}`).expect(200); // no sign-in
    expect(shared.body.report.vehicle.vehicleRef).toBe(ref('S06'));
    expect(JSON.stringify(shared.body)).not.toContain('4250000'); // repair cost stays confidential
    const links = await http.get('/v1/me/shares').set(buyer).expect(200);
    await http.delete(`/v1/me/shares/${links.body.items[0].id}`).set(buyer).expect(204);
    await http.get(`/v1/shared/${snap.body.shareToken}`).expect(404);
  });

  it('P-010: a car added by a buyer stays "not yet confirmed" until an official record matches it', async () => {
    const userId = await app.get(IamService).ensureUser('+256700000995', 'Pipeline Owner');
    const owner = { Authorization: `Bearer ${(await app.get(AuthService).issueTokens(userId)).accessToken}` };
    const http = request(app.getHttpServer());
    const added = await http.post('/v1/vehicles/provisional').set(owner)
      .send({ chassisNumber: 'GRJ150-0123456', plate: 'UBN 551Q', make: 'Toyota', model: 'Land Cruiser Prado', year: 2012 }).expect(202);
    expect(added.body.status).toBe('accepted');
    const card = await http.get('/v1/vehicles/search').query({ q: 'UBN 551Q' }).expect(200);
    expect(card.body.matches[0]).toMatchObject({ vehicleRef: added.body.vehicleRef, status: 'provisional' });
    expect(card.body.matches[0].make).toBeUndefined(); // owner-only details are too weak to state as facts
    const again = await http.post('/v1/vehicles/provisional').set(owner).send({ plate: 'UBN 551Q', make: 'Toyota', model: 'Prado', year: 2012 }).expect(409);
    expect(again.body.code).toBe('vehicle_exists');

    // The registry confirms the same chassis → the car is now confirmed.
    await request(app.getHttpServer()).post('/v1/ingest/submissions').set(auth).set('Idempotency-Key', '0192a000-0000-7000-8000-0000000000cc').set('X-Source-Code', 'REG')
      .send({ schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'GRJ150-0123456', plate: 'UBN 551Q' }, records: [
        { type: 'registration_issued', attributes: { plate: 'UBN 551Q' }, time: { at: '2015-03-01T00:00:00Z', precision: 'day' } }] }] }).expect(202);
    const after = await http.get('/v1/vehicles/search').query({ q: 'UBN 551Q' }).expect(200);
    expect(after.body.matches[0]).toMatchObject({ vehicleRef: added.body.vehicleRef, status: 'active' });
  });

  // ----- From here on the tests CHANGE data (reviewer and admin actions); keep them last. -----

  it('S08: a reviewer settles the cloned plate — the genuine car keeps it, the clone loses it', async () => {
    const queue = await request(app.getHttpServer()).get('/v1/admin/conflicts').query({ topic: 'identity' }).set(auth).expect(200);
    const conflict = queue.body.items.find((c: { vehicleRef: string }) => c.vehicleRef === ref('S08a'));
    expect(conflict).toMatchObject({ status: 'open', relatedVehicleRefs: [ref('S08b')] });

    const detail = await request(app.getHttpServer()).get(`/v1/admin/conflicts/${conflict.conflictId}`).set(auth).expect(200);
    expect(detail.body.disputedPlates).toEqual(['UAX 123A']);

    // Resolving needs reasoning.
    await request(app.getHttpServer()).post(`/v1/admin/conflicts/${conflict.conflictId}/actions`).set(auth)
      .send({ action: 'resolve', interpretation: 'clone' }).expect(400);
    const done = await request(app.getHttpServer()).post(`/v1/admin/conflicts/${conflict.conflictId}/actions`).set(auth)
      .send({ action: 'resolve', interpretation: 'S08b is using a cloned plate', reasoning: 'Registry record and chassis match S08a',
        plateDispute: { plate: 'UAX 123A', keepVehicleRef: ref('S08a') } }).expect(200);
    expect(done.body.status).toBe('resolved');
    await request(app.getHttpServer()).post(`/v1/admin/conflicts/${conflict.conflictId}/actions`).set(auth)
      .send({ action: 'dismiss', reasoning: 'again' }).expect(409);

    const search = await request(app.getHttpServer()).get('/v1/vehicles/search').query({ q: 'UAX 123A' }).expect(200);
    expect(search.body.outcome).toBe('found');
    expect(search.body.matches.map((m: { vehicleRef: string }) => m.vehicleRef)).toEqual([ref('S08a')]);
    expect(search.body.matches[0].banner).toBeUndefined();

    // The clone's own identity conflict closes by itself once the cause is gone.
    const after = await request(app.getHttpServer()).get('/v1/admin/conflicts').query({ topic: 'identity', status: 'auto_resolved' }).set(auth).expect(200);
    expect(after.body.items.map((c: { vehicleRef: string }) => c.vehicleRef)).toContain(ref('S08b'));
  });

  it('X1: retiring the simulated lien feed excludes its records without deleting them', async () => {
    const sources = await request(app.getHttpServer()).get('/v1/admin/sources').set(auth).expect(200);
    const lien = sources.body.find((s: { domain: string; isSimulated: boolean }) => s.domain === 'finance' && s.isSimulated);
    // The real registry feed is connected (D-011): the simulated one is retired and superseded by it.
    const ingestion = app.get(IngestionService);
    const realId = await ingestion.upsertSource({
      code: 'LIEN-REAL', name: 'Lien registry (live)', organisationId: (await ingestion.sourceById(lien.id))!.organisationId,
      domain: 'finance', channel: 'api', isSimulated: false, evidenceClass: 'official', baselineReputation: 0.9, coverage: [],
    });
    await request(app.getHttpServer()).patch(`/v1/admin/sources/${lien.id}`).set(auth).send({ status: 'retired' }).expect(400);
    const updated = await request(app.getHttpServer()).patch(`/v1/admin/sources/${lien.id}`).set(auth)
      .send({ status: 'retired', supersededBySourceId: realId, reason: 'Real lien registry connected' }).expect(200);
    expect(updated.body).toMatchObject({ status: 'retired', supersededBySourceId: realId });

    const ledger = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S12')}/evidence`).set(auth).expect(200);
    const record = ledger.body.items.find((i: { type: string }) => i.type === 'finance_lien_registered');
    expect(record).toMatchObject({ excluded: true, exclusionReason: 'retired_simulated_source' });
    const report = await request(app.getHttpServer()).get(`/v1/vehicles/${ref('S12')}/report`).set(auth).expect(200);
    expect(report.body.facts.find((f: { key: string }) => f.key === 'finance_status')?.value).not.toBe('active');
  });

  it('a full rebuild recomputes every vehicle', async () => {
    const res = await request(app.getHttpServer()).post('/v1/admin/rebuilds').set(auth).send({}).expect(202);
    expect(res.body).toMatchObject({ status: 'done' });
    expect(res.body.vehicles).toBeGreaterThanOrEqual(27);
  });
});
