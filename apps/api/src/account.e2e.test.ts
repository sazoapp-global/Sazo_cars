// Account settings over HTTP on a fresh database: rename, change phone (code to the new number), texts
// opt-out, devices, download my data, and deleting the account (Data Protection and Privacy Act 2019).
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
import { PartiesService } from './modules/obs/index.js';
import { ConsoleSmsSender } from './modules/notify/index.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('account settings (e2e)', () => {
  const dbName = `sazo_acct_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
    const adminId = await app.get(IamService).ensureUser('+256700000992', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;

    const ingestion = app.get(IngestionService);
    await ingestion.upsertSource({ code: 'REG', name: 'Registry (simulated)', organisationId: randomUUID(), domain: 'registration', channel: 'simulated_feed',
      isSimulated: true, evidenceClass: 'official', baselineReputation: 0.9, coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] });
    await ingestion.submit('REG', { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'ZRE142-6077777', plate: 'UBR 202B' }, records: [
      { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Corolla Axio', year: 2012, colour: 'Silver', engineNumber: '1NZ-D777777' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
      { type: 'registration_issued', attributes: { plate: 'UBR 202B' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
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

  const OLD = '+256772800001';
  const NEW = '+256772800099';
  let token: string;
  let userId: string;

  it('rename and move the account to a new phone number (code goes to the new number; other devices signed out)', async () => {
    token = await signIn(OLD, 'Sarah N');
    userId = (await http.get('/v1/me').set(bearer(token)).expect(200)).body.id;
    await http.patch('/v1/me').set(bearer(token)).send({ displayName: 'S' }).expect(400);
    await http.patch('/v1/me').set(bearer(token)).send({ displayName: 'Sarah Namukasa' }).expect(204);
    expect((await http.get('/v1/me').set(bearer(token)).expect(200)).body.displayName).toBe('Sarah Namukasa');

    await http.post('/v1/auth/otp/request').send({ phone: OLD }).expect(202);
    const other = (await http.post('/v1/auth/otp/verify').send({ phone: OLD, code: sms(OLD)!.match(/\b(\d{6})\b/)![1] }).expect(200)).body.accessToken;
    expect((await http.get('/v1/me/sessions').set(bearer(token)).expect(200)).body.items).toHaveLength(2);

    await http.post('/v1/me/phone/code').set(bearer(token)).send({ phone: OLD }).expect(400);
    await http.post('/v1/me/phone/code').set(bearer(token)).send({ phone: NEW }).expect(202);
    const code = sms(NEW)!.match(/\b(\d{6})\b/)![1]!;
    expect(sms(NEW)).toContain('move your account to this number');
    await http.post('/v1/me/phone').set(bearer(token)).send({ phone: NEW, code: code === '000000' ? '111111' : '000000' }).expect(422);
    await http.post('/v1/me/phone').set(bearer(token)).send({ phone: NEW, code }).expect(204);
    expect(sms(OLD)).toContain('now uses a different phone number');
    await http.get('/v1/me').set(bearer(other)).expect(401);
    await http.get('/v1/me').set(bearer(token)).expect(200);
    // The new number signs in to the same account; the old number is free.
    const viaNew = await signIn(NEW);
    expect((await http.get('/v1/me').set(bearer(viaNew)).expect(200)).body.id).toBe(userId);
    await http.post('/v1/auth/otp/request').send({ phone: OLD }).expect(202);
    expect((await http.post('/v1/auth/otp/verify').send({ phone: OLD, code: sms(OLD)!.match(/\b(\d{6})\b/)![1] }).expect(400)).body.code).toBe('display_name_required');
    // Another account's number can't be taken.
    await signIn('+256772800050', 'Someone else');
    await http.post('/v1/me/phone/code').set(bearer(token)).send({ phone: '+256772800050' }).expect(202);
    expect((await http.post('/v1/me/phone').set(bearer(token)).send({ phone: '+256772800050', code: sms('+256772800050')!.match(/\b(\d{6})\b/)![1] }).expect(409)).body.code).toBe('phone_in_use');
  });

  it('turning off visit texts wins over any consent a garage records', async () => {
    expect((await http.get('/v1/me/preferences').set(bearer(token)).expect(200)).body).toEqual({ visitConfirmationTexts: true });
    const parties = app.get(PartiesService);
    const party = await parties.upsertPerson({ phone: NEW });
    await parties.recordConsent(party, 'attestation_sms', 'garage_app');
    expect(await parties.hasConsent(party, 'attestation_sms')).toBe(true);
    expect((await http.put('/v1/me/preferences').set(bearer(token)).send({ visitConfirmationTexts: false }).expect(200)).body).toEqual({ visitConfirmationTexts: false });
    expect(await parties.hasConsent(party, 'attestation_sms')).toBe(false);
    await parties.recordConsent(party, 'attestation_sms', 'garage_app');
    expect(await parties.hasConsent(party, 'attestation_sms')).toBe(false);
  });

  it('download my data, sign out other devices', async () => {
    const ref = (await http.get('/v1/vehicles/search').query({ q: 'UBR 202B' }).expect(200)).body.matches[0].vehicleRef;
    await http.post('/v1/me/saved-checks').set(bearer(token)).send({ vehicleRef: ref }).expect(204);
    await http.post(`/v1/vehicles/${ref}/snapshots`).set(bearer(token)).send({ createShareLink: true }).expect(201);
    const data = (await http.get('/v1/me/export').set(bearer(token)).expect(200)).body;
    expect(data).toMatchObject({ profile: { displayName: 'Sarah Namukasa', phone: NEW }, preferences: { visitConfirmationTexts: false }, savedCars: [{ vehicleRef: ref }] });
    expect(data.sharedReports).toHaveLength(1);
    expect(data.devices.some((d: { current: boolean }) => d.current)).toBe(true);
    const r = await http.post('/v1/me/sessions/sign-out-others').set(bearer(token)).expect(201);
    expect(r.body.signedOut).toBeGreaterThan(0);
    expect((await http.get('/v1/me/sessions').set(bearer(token)).expect(200)).body.items).toHaveLength(1);
  });

  it('delete the account: refused while sole manager of a business with staff; then everything personal goes', async () => {
    const manager = await signIn('+256772800070', 'Garage boss');
    const orgId = (await http.post('/v1/organisations').set(bearer(manager)).send({ type: 'garage', legalName: 'Kyanja Motors Ltd' }).expect(201)).body.id;
    await http.post(`/v1/admin/organisations/${orgId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Workshop checked' }).expect(200);
    await http.post('/v1/garage/staff').set({ ...bearer(manager), 'X-Organisation-Id': orgId }).send({ phone: '+256772800071', displayName: 'Mechanic', role: 'org_staff' }).expect(201);
    await http.delete('/v1/me').set(bearer(manager)).send({}).expect(400);
    expect((await http.delete('/v1/me').set(bearer(manager)).send({ confirm: 'DELETE' }).expect(409)).body).toMatchObject({ code: 'hand_over_first', errors: ['Kyanja Motors Ltd'] });

    await http.delete('/v1/me').set(bearer(token)).send({ confirm: 'DELETE' }).expect(204);
    await http.get('/v1/me').set(bearer(token)).expect(401);
    expect(sms(NEW)).toContain('account has been deleted');
    const { rows: [u] } = await db.query(`SELECT display_name, phone_e164, status FROM iam.users WHERE id = $1`, [userId]);
    expect(u).toEqual({ display_name: 'Deleted account', phone_e164: null, status: 'deleted' });
    const { rows: [p] } = await db.query(`SELECT phone_ciphertext, phone_hash, erased_at IS NOT NULL AS erased FROM pii.parties WHERE id IN (SELECT party_id FROM pii.party_consents) LIMIT 1`);
    expect(p).toEqual({ phone_ciphertext: null, phone_hash: null, erased: true });
    expect((await db.query(`SELECT count(*)::int AS n FROM report.saved_checks WHERE user_id = $1`, [userId])).rows[0].n).toBe(0);
    expect((await db.query(`SELECT count(*)::int AS n FROM report.shared_links WHERE created_by_user_id = $1 AND revoked_at IS NULL`, [userId])).rows[0].n).toBe(0);
    // The number can start afresh as a new account.
    await http.post('/v1/auth/otp/request').send({ phone: NEW }).expect(202);
    const fresh = (await http.post('/v1/auth/otp/verify').send({ phone: NEW, code: sms(NEW)!.match(/\b(\d{6})\b/)![1], displayName: 'Sarah again' }).expect(200)).body.accessToken;
    expect((await http.get('/v1/me').set(bearer(fresh)).expect(200)).body.id).not.toBe(userId);
  });
});
