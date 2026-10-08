// Security review S5 on a fresh database: business sign-ups, staff invitations and share links have limits,
// and requests sent at the same moment cannot get past them.
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
import { ConsoleSmsSender } from './modules/notify/index.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('limits (e2e, security S5)', () => {
  const dbName = `sazo_limits_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sms = (phone: string) => app.get(ConsoleSmsSender, { strict: false }).latest(phone);
  const statuses = (rs: { status: number }[]) => rs.map((r) => r.status).sort();

  async function signIn(phone: string, displayName?: string) {
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = sms(phone)!.match(/\b(\d{6})\b/)![1];
    return (await http.post('/v1/auth/otp/verify').send({ phone, code, displayName }).expect(200)).body.accessToken as string;
  }

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString(), EVIDENCE_DIR: evidenceDir }));
    await app.listen(0); // one listening server, so many requests can be sent at once
    http = request(app.getHttpServer());
    const adminId = await app.get(IamService).ensureUser('+256700000993', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    const ingestion = app.get(IngestionService);
    await ingestion.upsertSource({ code: 'REG', name: 'Registry (simulated)', organisationId: randomUUID(), domain: 'registration', channel: 'simulated_feed',
      isSimulated: true, evidenceClass: 'official', baselineReputation: 0.9, coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] });
    await ingestion.submit('REG', { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'NZE141-1234567', plate: 'UBK 101L' }, records: [
      { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Corolla', year: 2010 }, time: { at: '2016-02-01T00:00:00Z', precision: 'day' } },
      { type: 'registration_issued', attributes: { plate: 'UBK 101L' }, time: { at: '2016-02-01T00:00:00Z', precision: 'day' } },
    ] }] }, { idempotencyKey: randomUUID() });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  let owner: string;
  let orgId: string;

  it('a person can register up to 3 businesses a day, even when the requests arrive together', async () => {
    owner = await signIn('+256772700001', 'Owner');
    const rs = await Promise.all([1, 2, 3, 4, 5].map((i) =>
      http.post('/v1/organisations').set(bearer(owner)).send({ type: 'garage', legalName: `Workshop ${i} Ltd` })));
    expect(statuses(rs)).toEqual([201, 201, 201, 429, 429]);
    expect(rs.find((r) => r.status === 429)!.body).toMatchObject({ code: 'limit_reached', detail: expect.stringContaining('3 businesses a day') });
    orgId = rs.find((r) => r.status === 201)!.body.id;
    // Someone else is not affected.
    await http.post('/v1/organisations').set(bearer(await signIn('+256772700009', 'Other'))).send({ type: 'dealer', legalName: 'Other Ltd' }).expect(201);
  });

  it('a business can add up to 3 staff a minute', async () => {
    await http.post(`/v1/admin/organisations/${orgId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Checked' }).expect(200);
    const rs = await Promise.all([2, 3, 4, 5].map((i) =>
      http.post('/v1/garage/staff').set({ ...bearer(owner), 'X-Organisation-Id': orgId }).send({ phone: `+25677270010${i}`, displayName: `Mechanic ${i}`, role: 'org_staff' })));
    expect(statuses(rs)).toEqual([201, 201, 201, 429]);
  });

  it('a person can make up to 20 share links a day; a report without a link is not limited', async () => {
    const buyer = await signIn('+256772700050', 'Buyer');
    const ref = (await http.get('/v1/vehicles/search').query({ q: 'UBK 101L' }).expect(200)).body.matches[0].vehicleRef;
    const rs = await Promise.all(Array.from({ length: 22 }, () => http.post(`/v1/vehicles/${ref}/snapshots`).set(bearer(buyer)).send({})));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(20);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(2);
    await http.post(`/v1/vehicles/${ref}/snapshots`).set(bearer(buyer)).send({ createShareLink: false }).expect(201);
  });
});
