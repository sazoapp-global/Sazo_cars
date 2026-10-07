// Sign-in and access control over HTTP, on a brand-new migrated database (no scenario data).
// Covers phone codes, refresh rotation + reuse detection, 401/403, and X4 (a pending business cannot submit).
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
import { ConsoleSmsSender } from './modules/notify/index.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('sign-in and access control (e2e)', () => {
  const dbName = `sazo_auth_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const admin = new pg.Client({ connectionString: base });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let garageToken: string;

  const codeFor = (phone: string): string => {
    const text = app.get(ConsoleSmsSender, { strict: false }).latest(phone);
    const m = text?.match(/\b(\d{6})\b/);
    if (!m) throw new Error(`no code sent to ${phone}`);
    return m[1]!;
  };

  async function signIn(phone: string, displayName: string) {
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const res = await http.post('/v1/auth/otp/verify').send({ phone, code: codeFor(phone), displayName }).expect(200);
    return res.body as { accessToken: string; refreshToken: string; expiresIn: number };
  }

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const submission = (chassis: string) => ({
    schemaVersion: 1,
    items: [{ identifiers: { chassisNumber: chassis }, records: [
      { type: 'service_performed', attributes: { items: ['engine_oil'] }, time: { at: '2026-09-01T09:00:00Z', precision: 'day' } }] }],
  });

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString() }));
    await app.init();
    http = request(app.getHttpServer());
    const adminId = await app.get(IamService).ensureUser('+256700000999', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('first sign-in with a phone code creates a consumer account (name required)', async () => {
    const phone = '+256772100001';
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = codeFor(phone);
    await http.post('/v1/auth/otp/verify').send({ phone, code: code === '000000' ? '111111' : '000000' }).expect(401);
    const noName = await http.post('/v1/auth/otp/verify').send({ phone, code }).expect(400);
    expect(noName.body.code).toBe('display_name_required');
    const ok = await http.post('/v1/auth/otp/verify').send({ phone, code, displayName: 'Amina N.' }).expect(200);
    expect(ok.body.accessToken).toBeTruthy();
    // A code works once.
    await http.post('/v1/auth/otp/verify').send({ phone, code, displayName: 'Amina N.' }).expect(401);

    const me = await http.get('/v1/me').set(bearer(ok.body.accessToken)).expect(200);
    expect(me.body).toMatchObject({ displayName: 'Amina N.', platformRoles: ['consumer'], memberships: [] });
  });

  it('the OTP itself is never stored in the outbound message log', async () => {
    const db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    const { rows } = await db.query(`SELECT params, to_phone_hash IS NOT NULL AS hashed FROM notify.outbound_messages WHERE purpose = 'otp'`);
    await db.end();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toEqual({ params: {}, hashed: true });
  });

  it('refresh tokens rotate; replaying a used one revokes the whole session', async () => {
    const t = await signIn('+256772100002', 'Brian K.');
    const r1 = await http.post('/v1/auth/refresh').send({ refreshToken: t.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(t.refreshToken);
    await http.get('/v1/me').set(bearer(r1.body.accessToken)).expect(200);

    // Someone replays the old token → session revoked, even the new tokens stop working.
    const reuse = await http.post('/v1/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);
    expect(reuse.body.code).toBe('invalid_token');
    await http.post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    await http.get('/v1/me').set(bearer(r1.body.accessToken)).expect(401);
  });

  it('sign-out ends the session', async () => {
    const t = await signIn('+256772100003', 'Grace A.');
    await http.post('/v1/auth/sign-out').set(bearer(t.accessToken)).expect(204);
    await http.get('/v1/me').set(bearer(t.accessToken)).expect(401);
  });

  it('protected routes need a sign-in; admin routes need the right permission', async () => {
    expect((await http.get('/v1/me').expect(401)).body.code).toBe('authentication_required');
    await http.get('/v1/me').set(bearer('not-a-token')).expect(401);
    await http.get('/v1/health').expect(200);
    await http.get('/v1/vehicles/search').query({ q: 'UAX 123A' }).expect(200);

    const consumer = await signIn('+256772100004', 'Daniel O.');
    for (const p of ['/v1/admin/organisations', '/v1/admin/conflicts', '/v1/admin/resolutions', '/v1/admin/sources']) {
      expect((await http.get(p).set(bearer(consumer.accessToken)).expect(403)).body.code).toBe('forbidden');
      await http.get(p).set(bearer(adminToken)).expect(200);
    }
  });

  it('X4: a business that is still pending cannot submit; after approval its manager can', async () => {
    const owner = await signIn('+256772100005', 'Moses Garage Owner');
    const org = await http.post('/v1/organisations').set(bearer(owner.accessToken))
      .send({ type: 'garage', legalName: 'Kireka Auto Works Ltd', district: 'Wakiso' }).expect(201);
    expect(org.body.status).toBe('pending_verification');
    const me = await http.get('/v1/me').set(bearer(owner.accessToken)).expect(200);
    expect(me.body.memberships[0]).toMatchObject({ role: 'org_manager', organisationStatus: 'pending_verification' });

    await app.get(IngestionService).upsertSource({
      code: 'KIR-PORTAL', name: 'Kireka portal', organisationId: org.body.id, domain: 'garage', channel: 'partner_portal',
      isSimulated: true, evidenceClass: 'garage', baselineReputation: 0.6, coverage: [],
    });
    const submit = (token: string, key: string) => http.post('/v1/ingest/submissions').set(bearer(token))
      .set('Idempotency-Key', key).set('X-Source-Code', 'KIR-PORTAL').send(submission('NZE161-7001234'));

    expect((await submit(owner.accessToken, '0192a000-0000-7000-8000-000000000101').expect(403)).body.code).toBe('organisation_not_approved');

    const queue = await http.get('/v1/admin/organisations').query({ status: 'pending_verification' }).set(bearer(adminToken)).expect(200);
    expect(queue.body.items.map((o: { id: string }) => o.id)).toContain(org.body.id);
    const decided = await http.post(`/v1/admin/organisations/${org.body.id}/decision`).set(bearer(adminToken))
      .send({ decision: 'approve', reason: 'Trading licence checked' }).expect(200);
    expect(decided.body.status).toBe('approved');

    garageToken = owner.accessToken;
    const ok = await submit(owner.accessToken, '0192a000-0000-7000-8000-000000000102').expect(202);
    expect(ok.body.status).toBe('processed');

    // Another signed-in user cannot use this garage's source, nor read its submissions.
    const stranger = await signIn('+256772100006', 'Not A Member');
    expect((await submit(stranger.accessToken, '0192a000-0000-7000-8000-000000000103').expect(403)).body.code).toBe('source_not_permitted');
    await http.get(`/v1/ingest/submissions/${ok.body.submissionId}`).set(bearer(stranger.accessToken)).expect(404);
    await http.get(`/v1/ingest/submissions/${ok.body.submissionId}`).set(bearer(owner.accessToken)).expect(200);
  });

  it('S24-style ambiguity goes to the reviewer queue and is decided once', async () => {
    const send = (key: string, identifiers: Record<string, string>) => http.post('/v1/ingest/submissions').set(bearer(garageToken))
      .set('Idempotency-Key', key).set('X-Source-Code', 'KIR-PORTAL')
      .send({ ...submission('unused'), items: [{ ...submission('unused').items[0]!, identifiers }] });

    const plateOnly = await send('0192a000-0000-7000-8000-000000000201', { plate: 'UBK 555K' }).expect(202);
    expect(plateOnly.body.items[0].resolution).toBe('created_provisional');
    const provisionalRef = plateOnly.body.items[0].vehicleRef;

    const withChassis = await send('0192a000-0000-7000-8000-000000000202', { chassisNumber: 'NZE161-7009999', plate: 'UBK 555K' }).expect(202);
    expect(withChassis.body.items[0]).toMatchObject({ status: 'needs_review', resolution: 'ambiguous' });

    const queue = await http.get('/v1/admin/resolutions').query({ outcome: 'ambiguous' }).set(bearer(adminToken)).expect(200);
    expect(queue.body.items).toHaveLength(1);
    const pending = queue.body.items[0];
    expect(pending.candidateVehicleRefs).toEqual([provisionalRef]);

    await http.post(`/v1/admin/resolutions/${pending.decisionId}/decide`).set(bearer(adminToken))
      .send({ outcome: 'matched', vehicleRef: 'SZV-0000-0000', reason: 'same car' }).expect(400);
    const decided = await http.post(`/v1/admin/resolutions/${pending.decisionId}/decide`).set(bearer(adminToken))
      .send({ outcome: 'matched', vehicleRef: provisionalRef, reason: 'Same Premio, owner confirmed by phone' }).expect(200);
    expect(decided.body).toMatchObject({ outcome: 'matched', matchedVehicleRef: provisionalRef, decidedBy: 'reviewer' });
    await http.post(`/v1/admin/resolutions/${pending.decisionId}/decide`).set(bearer(adminToken))
      .send({ outcome: 'rejected', reason: 'changed my mind' }).expect(409);

    const status = await http.get(`/v1/ingest/submissions/${withChassis.body.submissionId}`).set(bearer(garageToken)).expect(200);
    expect(status.body.items[0]).toMatchObject({ status: 'accepted', vehicleRef: provisionalRef });
    const search = await http.get('/v1/vehicles/search').query({ q: 'NZE161-7009999' }).expect(200);
    expect(search.body.matches[0]).toMatchObject({ vehicleRef: provisionalRef, status: 'active' });
    expect((await http.get('/v1/admin/resolutions').query({ outcome: 'ambiguous' }).set(bearer(adminToken)).expect(200)).body.items).toEqual([]);
  });

  it('every admin decision is written to the audit log', async () => {
    const db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    const { rows } = await db.query(`SELECT action FROM iam.audit_entries ORDER BY at`);
    await db.end();
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['organisation.registered', 'organisation.approve', 'identity.matched']));
  });
});
