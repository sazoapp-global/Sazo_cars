// Community over HTTP on a fresh database (D-063, P-008): reviews and creator videos attach to the model,
// wait for a moderator, and verified owners are marked.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
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
import { ReferenceService } from './modules/ref/index.js';
import { ConsoleSmsSender } from './modules/notify/index.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('community (e2e)', () => {
  const dbName = `sazo_comm_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sms = (phone: string) => app.get(ConsoleSmsSender, { strict: false }).latest(phone);

  async function signIn(phone: string, displayName?: string) {
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = sms(phone)!.match(/\b(\d{6})\b/)![1];
    return (await http.post('/v1/auth/otp/verify').send({ phone, code, displayName }).expect(200)).body.accessToken as string;
  }

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString(), EVIDENCE_DIR: evidenceDir }));
    await app.init();
    http = request(app.getHttpServer());
    const adminId = await app.get(IamService).ensureUser('+256700000993', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;

    const ingestion = app.get(IngestionService);
    await ingestion.upsertSource({ code: 'REG', name: 'Registry (simulated)', organisationId: randomUUID(), domain: 'registration', channel: 'simulated_feed',
      isSimulated: true, evidenceClass: 'official', baselineReputation: 0.9, coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] });
    await ingestion.submit('REG', { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'ZRE142-6077777', plate: 'UBR 202B' }, records: [
      { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Corolla Axio', year: 2012, colour: 'Silver', engineNumber: '1NZ-D777777' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
      { type: 'registration_issued', attributes: { plate: 'UBR 202B' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
      { type: 'odometer_reading', attributes: { km: 120000, originalValue: 120000, originalUnit: 'km' }, time: { at: '2026-01-10T00:00:00Z', precision: 'day' } },
      { type: 'ownership_transferred', attributes: { ownerPhone: '+256772700001' }, time: { at: '2024-01-10T00:00:00Z', precision: 'day' } },
    ] }] }, { idempotencyKey: randomUUID() });
    await app.get(ReferenceService).ensureModel('Toyota', 'Corolla Axio', 'all', 2006);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  let modelId: string;
  let vehicleRef: string;

  it('the report names the model; an owner and a non-owner review it; nothing shows before moderation', async () => {
    vehicleRef = (await http.get('/v1/vehicles/search').query({ q: 'UBR 202B' }).expect(200)).body.matches[0].vehicleRef;
    const owner = await signIn('+256772700001', 'Agnes Nakato');
    const r = (await http.get(`/v1/vehicles/${vehicleRef}/report`).set(bearer(owner)).expect(200)).body;
    expect(r.model).toMatchObject({ label: 'Toyota Corolla Axio' });
    modelId = r.model.modelId;
    await http.post(`/v1/vehicles/${vehicleRef}/ownership-claims`).set(bearer(owner)).send({}).expect(200);

    await http.post(`/v1/models/${modelId}/reviews`).set(bearer(owner)).send({ rating: 4, body: 'too short' }).expect(400);
    const mine = await http.post(`/v1/models/${modelId}/reviews`).set(bearer(owner)).send({ rating: 4, body: 'Cheap to run in Kampala traffic, parts everywhere. Suspension bushes wear on bad roads.' }).expect(201);
    expect(mine.body).toMatchObject({ status: 'pending', verifiedOwner: true });
    expect((await http.post(`/v1/models/${modelId}/reviews`).set(bearer(owner)).send({ rating: 5, body: 'A second review from the same person should be refused here.' }).expect(409)).body.code).toBe('already_reviewed');
    const other = await signIn('+256772700002', 'Brian Okello');
    await http.post(`/v1/models/${modelId}/reviews`).set(bearer(other)).send({ rating: 2, body: 'Mine had a weak CVT gearbox after 150,000 km and it was costly to fix.' }).expect(201);

    // Video links: only https TikTok / YouTube / Instagram; one suggestion per video and model.
    await http.post(`/v1/models/${modelId}/creator-links`).set(bearer(other)).send({ url: 'https://evil.example.com/video' }).expect(422);
    await http.post(`/v1/models/${modelId}/creator-links`).set(bearer(other)).send({ url: 'http://www.youtube.com/watch?v=abc' }).expect(422);
    await http.post(`/v1/models/${modelId}/creator-links`).set(bearer(other)).send({ url: 'https://www.youtube.com/watch?v=abc123', title: 'Axio long-term review' }).expect(201);
    await http.post(`/v1/models/${modelId}/creator-links`).set(bearer(owner)).send({ url: 'https://www.youtube.com/watch?v=abc123' }).expect(409);

    const before = (await http.get(`/v1/models/${modelId}/community`).expect(200)).body;
    expect(before).toMatchObject({ model: { label: 'Toyota Corolla Axio' }, reviewCount: 0, reviews: [], creatorLinks: [], myReviewStatus: null });
    expect((await http.get(`/v1/models/${modelId}/community`).set(bearer(owner)).expect(200)).body.myReviewStatus).toBe('pending');
    await http.get('/v1/admin/moderation').set(bearer(owner)).expect(403);
  });

  it('a moderator publishes; readers see first names only and the verified-owner mark', async () => {
    const queue = (await http.get('/v1/admin/moderation').set(bearer(adminToken)).expect(200)).body.items;
    expect(queue.map((c: { type: string }) => c.type)).toEqual(['model_review', 'model_review', 'creator_link']);
    expect(queue[0]).toMatchObject({ model: 'Toyota Corolla Axio', author: 'Agnes Nakato', rating: 4, verifiedOwner: true });
    for (const c of queue) {
      const decision = c.type === 'model_review' && c.rating === 2 ? 'reject' : 'approve';
      await http.post(`/v1/admin/moderation/${c.caseId}/decision`).set(bearer(adminToken)).send({ decision, reason: decision === 'approve' ? 'About the model, no personal details' : 'Unverifiable claim' }).expect(200);
    }
    await http.post(`/v1/admin/moderation/${queue[0].caseId}/decision`).set(bearer(adminToken)).send({ decision: 'reject', reason: 'again' }).expect(404);
    const after = (await http.get(`/v1/models/${modelId}/community`).expect(200)).body;
    expect(after.reviews).toEqual([expect.objectContaining({ author: 'Agnes', verifiedOwner: true, rating: 4 })]);
    expect(after.averageRating).toBeNull(); // fewer than 3 reviews
    expect(after.creatorLinks).toEqual([expect.objectContaining({ platform: 'youtube', title: 'Axio long-term review' })]);
    expect(JSON.stringify(after)).not.toMatch(/Nakato|Brian|256772/);
  });
});
