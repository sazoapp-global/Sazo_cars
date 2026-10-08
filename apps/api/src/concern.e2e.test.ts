// Concerns over HTTP on a fresh database (O-002): a garage reports signs of fraud, the car shows a neutral
// "being checked" notice, SAZO staff dismiss or uphold, and buyers see only what was upheld.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
import { ConsoleSmsSender } from './modules/notify/index.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('concerns (e2e)', () => {
  const dbName = `sazo_concern_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let managerToken: string;
  let mechanicToken: string;
  let orgId: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const asOrg = (t: string) => ({ ...bearer(t), 'X-Organisation-Id': orgId });
  const sms = (phone: string) => app.get(ConsoleSmsSender, { strict: false }).latest(phone);

  async function signIn(phone: string, displayName?: string) {
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = sms(phone)!.match(/\b(\d{6})\b/)![1];
    return (await http.post('/v1/auth/otp/verify').send({ phone, code, displayName }).expect(200)).body.accessToken as string;
  }

  async function upload(token: string, kind: string, content: string): Promise<string> {
    const bytes = Buffer.from(content);
    const slot = await http.post('/v1/evidence/uploads').set(bearer(token))
      .send({ kind, mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }).expect(201);
    await http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(token)).set('Content-Type', 'image/jpeg').send(bytes).expect(204);
    return (await http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(token)).expect(200)).body.evidenceId;
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
    const adminId = await app.get(IamService).ensureUser('+256700000994', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;

    const ingestion = app.get(IngestionService);
    await ingestion.upsertSource({ code: 'REG', name: 'Registry (simulated)', organisationId: randomUUID(), domain: 'registration', channel: 'simulated_feed',
      isSimulated: true, evidenceClass: 'official', baselineReputation: 0.9, coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] });
    await ingestion.submit('REG', { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'ZRE142-6033333', plate: 'UBU 606E' }, records: [
      { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Corolla Axio', year: 2012, colour: 'Silver', engineNumber: '1NZ-D777777' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
      { type: 'registration_issued', attributes: { plate: 'UBU 606E' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
      { type: 'odometer_reading', attributes: { km: 120000, originalValue: 120000, originalUnit: 'km' }, time: { at: '2026-01-10T00:00:00Z', precision: 'day' } },
    ] }] }, { idempotencyKey: randomUUID() });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  let vehicleRef: string;
  const asGarage = () => ({ ...bearer(mechanicToken), 'X-Organisation-Id': orgId });
  const notices = async () => (await http.get(`/v1/vehicles/${vehicleRef}/summary`).expect(200)).body.notices;

  it('a garage reports a copied plate: the car shows "being checked" until SAZO decides', async () => {
    managerToken = await signIn('+256772600001', 'Owner');
    orgId = (await http.post('/v1/organisations').set(bearer(managerToken)).send({ type: 'garage', legalName: 'Bweyogerere Motors Ltd', tradingName: 'Bweyogerere Motors' }).expect(201)).body.id;
    await http.post(`/v1/admin/organisations/${orgId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Workshop checked' }).expect(200);
    await http.post('/v1/garage/staff').set(asOrg(managerToken)).send({ phone: '+256772600002', displayName: 'Musa', role: 'org_staff' }).expect(201);
    mechanicToken = await signIn('+256772600002');
    vehicleRef = (await http.get('/v1/vehicles/search').query({ q: 'UBU 606E' }).expect(200)).body.matches[0].vehicleRef;
    expect(await notices()).toEqual([]);

    await http.post('/v1/concerns').set(asGarage()).send({ plate: 'UBU 606E', category: 'cloned_plate', description: 'short' }).expect(400);
    const photo = await upload(mechanicToken, 'vehicle_photo', 'two plates in the boot');
    const res = await http.post('/v1/concerns').set(asGarage()).send({ plate: 'ubu 606e', category: 'cloned_plate', description: 'Customer car had a second set of plates in the boot', evidenceIds: [photo] }).expect(201);
    expect(res.body).toMatchObject({ vehicleRef, category: 'cloned_plate', severity: 'serious', status: 'open' });
    expect(await notices()).toEqual([{ kind: 'under_review' }]);
    expect((await http.get('/v1/concerns').set(asGarage()).expect(200)).body.items).toHaveLength(1);

    // Only businesses raise concerns; only SAZO staff review them.
    const buyer = await signIn('+256772600050', 'A buyer');
    await http.post('/v1/concerns').set({ ...bearer(buyer), 'X-Organisation-Id': orgId }).send({ plate: 'UBU 606E', category: 'other', description: 'I just do not like it' }).expect(403);
    await http.get('/v1/admin/concerns').set(bearer(buyer)).expect(403);

    const queue = (await http.get('/v1/admin/concerns').set(bearer(adminToken)).expect(200)).body.items;
    expect(queue[0]).toMatchObject({ organisation: 'Bweyogerere Motors', reporter: 'Musa', evidenceIds: [photo] });
    await http.get(`/v1/evidence/${photo}/content`).set(bearer(adminToken)).expect(200);
    await http.post(`/v1/admin/concerns/${queue[0].concernId}/decision`).set(bearer(adminToken)).send({ decision: 'dismiss', reason: 'Spare plates from the previous registration' }).expect(200);
    expect(await notices()).toEqual([]);
    await http.post(`/v1/admin/concerns/${queue[0].concernId}/decision`).set(bearer(adminToken)).send({ decision: 'uphold', reason: 'again' }).expect(404);
  });

  it('an upheld concern stays on the report; a report about an unclear plate is linked by staff', async () => {
    const res = await http.post('/v1/concerns').set(asGarage()).send({ plate: 'UBU 606E', vehicleRef, category: 'odometer_tampered', description: 'Cluster screws scratched, pedals worn far beyond 40,000 km' }).expect(201);
    await http.post(`/v1/admin/concerns/${res.body.concernId}/decision`).set(bearer(adminToken)).send({ decision: 'uphold', reason: 'Service records elsewhere show 160,000 km' }).expect(200);
    expect(await notices()).toEqual([{ kind: 'upheld', category: 'odometer_tampered' }]);
    expect((await http.get(`/v1/vehicles/${vehicleRef}/report`).set(bearer(managerToken)).expect(200)).body.notices).toEqual([{ kind: 'upheld', category: 'odometer_tampered' }]);

    const unknown = await http.post('/v1/concerns').set(asGarage()).send({ plate: 'UZZ 000Z', category: 'other', description: 'Car left without paying, plate looked painted on' }).expect(201);
    expect(unknown.body.vehicleRef).toBeUndefined();
    await http.post(`/v1/admin/concerns/${unknown.body.concernId}/decision`).set(bearer(adminToken)).send({ decision: 'uphold', reason: 'Matched by chassis photo', vehicleRef }).expect(200);
    expect((await notices()).map((n: { category?: string }) => n.category).sort()).toEqual(['odometer_tampered', 'other']);
    const mine = (await http.get('/v1/concerns').set(asGarage()).expect(200)).body.items;
    expect(mine.map((c: { status: string }) => c.status)).toEqual(['upheld', 'upheld', 'dismissed']);
  });
});
