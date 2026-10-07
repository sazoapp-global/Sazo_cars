// The garage journey over HTTP on a fresh database (D-050…D-059): approval, staff, lookup, photos,
// drafts, consistency warnings, submit, owner confirmation by SMS link, and a car new to SAZO.
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

describe.skipIf(!base)('garage workspace (e2e)', () => {
  const dbName = `sazo_garage_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  let garageId: string;
  const CUSTOMER = '+256772555123';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const asGarage = (t: string) => ({ ...bearer(t), 'X-Organisation-Id': garageId });
  const sms = (phone: string) => app.get(ConsoleSmsSender, { strict: false }).latest(phone);

  async function signIn(phone: string, displayName?: string) {
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const code = sms(phone)!.match(/\b(\d{6})\b/)![1];
    return (await http.post('/v1/auth/otp/verify').send({ phone, code, displayName }).expect(200)).body.accessToken as string;
  }

  async function upload(token: string, kind: string, content: string): Promise<string> {
    const bytes = Buffer.from(content);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const slot = await http.post('/v1/evidence/uploads').set(bearer(token))
      .send({ kind, mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256 }).expect(201);
    await http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(token)).set('Content-Type', 'image/jpeg').send(bytes).expect(204);
    const done = await http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(token)).expect(200);
    expect(done.body).toMatchObject({ evidenceId: slot.body.evidenceId, kind, sha256 });
    return done.body.evidenceId;
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
    const adminId = await app.get(IamService).ensureUser('+256700000997', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;

    // A registered Premio already known to SAZO (simulated registry + an earlier reading).
    const ingestion = app.get(IngestionService);
    await ingestion.upsertSource({ code: 'REG', name: 'Registry (simulated)', organisationId: randomUUID(), domain: 'registration', channel: 'simulated_feed',
      isSimulated: true, evidenceClass: 'official', baselineReputation: 0.9, coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] });
    await ingestion.submit('REG', { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'NZT260-3055555', plate: 'UBQ 101A' }, records: [
      { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Premio', year: 2014, colour: 'Silver', engineNumber: '1NZ-C333333' }, time: { at: '2016-05-01T00:00:00Z', precision: 'day' } },
      { type: 'registration_issued', attributes: { plate: 'UBQ 101A' }, time: { at: '2016-05-01T00:00:00Z', precision: 'day' } },
      { type: 'odometer_reading', attributes: { km: 90000, originalValue: 90000, originalUnit: 'km' }, time: { at: '2026-03-01T00:00:00Z', precision: 'day' } },
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

  it('a garage is approved, then its manager adds a mechanic (D-055, D-056)', async () => {
    managerToken = await signIn('+256772300001', 'Sarah (Manager)');
    garageId = (await http.post('/v1/organisations').set(bearer(managerToken)).send({ type: 'garage', legalName: 'Ntinda Auto Clinic Ltd', tradingName: 'Ntinda Auto Clinic' }).expect(201)).body.id;

    // Pending: nothing works yet.
    expect((await http.get('/v1/garage/vehicles/lookup').query({ plate: 'UBQ 101A' }).set(asGarage(managerToken)).expect(403)).body.code).toBe('organisation_not_approved');
    await http.post(`/v1/admin/organisations/${garageId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Visited the workshop' }).expect(200);

    const added = await http.post('/v1/garage/staff').set(asGarage(managerToken)).send({ phone: '+256772300002', displayName: 'Musa (Mechanic)', role: 'org_staff' }).expect(201);
    expect(added.body).toMatchObject({ displayName: 'Musa (Mechanic)', role: 'org_staff', status: 'active' });
    expect(sms('+256772300002')).toContain('Ntinda Auto Clinic added you');
    mechanicToken = await signIn('+256772300002');
    const staff = await http.get('/v1/garage/staff').set(asGarage(managerToken)).expect(200);
    expect(staff.body.map((m: { displayName: string }) => m.displayName)).toEqual(['Sarah (Manager)', 'Musa (Mechanic)']);

    // Staff record jobs but cannot manage staff; outsiders get nothing; the header is required.
    await http.post('/v1/garage/staff').set(asGarage(mechanicToken)).send({ phone: '+256772300003', displayName: 'X', role: 'org_staff' }).expect(403);
    const outsider = await signIn('+256772300009', 'Outsider');
    await http.get('/v1/garage/jobs').set(asGarage(outsider)).expect(403);
    await http.get('/v1/garage/jobs').set(bearer(mechanicToken)).expect(400);
  });

  it('lookup by plate shows what the mechanic needs to confirm, not who serviced it before (D-053)', async () => {
    const res = await http.get('/v1/garage/vehicles/lookup').query({ plate: 'ubq101a' }).set(asGarage(mechanicToken)).expect(200);
    expect(res.body.outcome).toBe('found');
    expect(res.body.candidates[0]).toMatchObject({
      make: 'Toyota', model: 'Premio', year: 2014, chassisLast4: '5555', expectedEngineNumber: '1NZ-C333333', lastMileage: { km: 90000, on: '2026-03-01' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/REG|Registry/);
    const none = await http.get('/v1/garage/vehicles/lookup').query({ plate: 'UBZ 999Z' }).set(asGarage(mechanicToken)).expect(200);
    expect(none.body).toMatchObject({ outcome: 'not_found', newVehicleRequires: ['plate_photo'] });
  });

  it('photo uploads are checked against their declared hash', async () => {
    const bytes = Buffer.from('not what was declared');
    const slot = await http.post('/v1/evidence/uploads').set(bearer(mechanicToken))
      .send({ kind: 'odometer_photo', mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256: 'a'.repeat(64) }).expect(201);
    const bad = await http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(mechanicToken)).set('Content-Type', 'image/jpeg').send(bytes).expect(422);
    expect(bad.body.code).toBe('hash_mismatch');
    // Someone else's upload slot is invisible.
    await http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(managerToken)).expect(404);
  });

  const jobId = randomUUID();
  let odometerPhoto: string;
  let vehicleRef: string;

  it('drafts save as the mechanic goes, with version checks; customer details stay in the private store', async () => {
    vehicleRef = (await http.get('/v1/garage/vehicles/lookup').query({ plate: 'UBQ 101A' }).set(asGarage(mechanicToken))).body.candidates[0].vehicleRef;
    odometerPhoto = await upload(mechanicToken, 'odometer_photo', 'odometer photo bytes 85000');
    const draft = {
      plateEntered: 'UBQ 101A', vehicleRef, workTypes: ['service'], clientCreatedAt: new Date(Date.now() - 3600_000).toISOString(),
      form: { mileage: { value: 85000, unit: 'km', odometerPhotoId: odometerPhoto }, customer: { name: 'Peter Okello', phone: CUSTOMER, smsConsent: true },
        cost: { total: { amount: 350000, currency: 'UGX' }, method: 'mtn_momo' } },
    };
    const v1 = await http.put(`/v1/garage/jobs/${jobId}`).set(asGarage(mechanicToken)).send(draft).expect(200);
    expect(v1.body).toMatchObject({ status: 'draft', version: 1, vehicleRef, createdBy: { displayName: 'Musa (Mechanic)' } });
    expect(v1.body.publicRef).toMatch(/^GJ-\d{4}-\d{5}$/);
    expect(v1.body.form.customer).toEqual({ name: 'Peter Okello', phoneMasked: '+256 77• ••• 123', smsConsent: true });

    const v2 = await http.put(`/v1/garage/jobs/${jobId}`).set(asGarage(mechanicToken))
      .send({ ...draft, version: 1, form: { ...draft.form, service: { items: ['engine_oil', 'oil_filter'] } } }).expect(200);
    expect(v2.body.version).toBe(2);
    expect((await http.put(`/v1/garage/jobs/${jobId}`).set(asGarage(managerToken)).send({ ...draft, version: 1 }).expect(409)).body.code).toBe('version_conflict');

    const { rows } = await db.query(`SELECT form FROM garage.jobs WHERE id = $1`, [jobId]);
    expect(rows[0].form).not.toHaveProperty('customer');
    const parties = await db.query(`SELECT name_ciphertext, phone_ciphertext FROM pii.parties`);
    expect(parties.rows).toHaveLength(1);
    expect(parties.rows[0].phone_ciphertext.toString('latin1')).not.toContain('772555123');
  });

  it('a lower mileage than last time must be explained before submitting (D-059 warn, don\'t block)', async () => {
    const key = randomUUID();
    const warned = await http.post(`/v1/garage/jobs/${jobId}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', key).send({}).expect(422);
    expect(warned.body.code).toBe('warnings_need_acknowledgement');
    expect(warned.body.errors).toEqual([expect.objectContaining({ code: 'mileage_lower_than_last', severity: 'serious', params: { lastKm: 90000, lastOn: '2026-03-01', enteredKm: 85000 } })]);

    const ack = { acknowledgedWarnings: [{ code: 'mileage_lower_than_last', explanation: 'Dashboard was replaced in March; photo attached' }] };
    const res = await http.post(`/v1/garage/jobs/${jobId}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', key).send(ack).expect(202);
    expect(res.body).toMatchObject({ status: 'submitted', jobStatus: 'accepted', vehicleRef, ownerConfirmation: 'pending' });

    // A retried tap is safe; a second, different submit is not allowed; the job is now read-only.
    const replay = await http.post(`/v1/garage/jobs/${jobId}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', key).send(ack).expect(202);
    expect(replay.body.submissionId).toBe(res.body.submissionId);
    await http.post(`/v1/garage/jobs/${jobId}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', randomUUID()).send(ack).expect(409);
    await http.put(`/v1/garage/jobs/${jobId}`).set(asGarage(mechanicToken))
      .send({ plateEntered: 'UBQ 101A', workTypes: ['service'], clientCreatedAt: new Date().toISOString(), form: {} }).expect(409);

    // The record is in the vehicle's history, and the cost stays confidential.
    const ledger = await http.get(`/v1/vehicles/${vehicleRef}/evidence`).set(bearer(adminToken)).expect(200);
    const types = ledger.body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(expect.arrayContaining(['odometer_reading', 'service_performed']));
    expect(types).not.toContain('cost_recorded');
  });

  it('the customer confirms by SMS link — once, without signing in (D-058)', async () => {
    const text = sms(CUSTOMER)!;
    expect(text).toContain('Ntinda Auto Clinic recorded a service on UBQ 101A at 85,000 km');
    const token = text.match(/\/a\/([A-Za-z0-9_-]+)/)![1]!;

    const view = await http.get(`/v1/attest/${token}`).expect(200);
    expect(view.body).toMatchObject({ garageName: 'Ntinda Auto Clinic', plate: 'UBQ 101A', mileageKm: 85000, answered: null });
    expect(JSON.stringify(view.body)).not.toMatch(/350000|Peter|Musa/);

    await http.post(`/v1/attest/${token}`).send({ response: 'confirmed' }).expect(204);
    await http.post(`/v1/attest/${token}`).send({ response: 'disputed' }).expect(409);
    await http.get('/v1/attest/AAAAAAAAAAAAAAAAAAAAAAAA').expect(404);

    const job = await http.get(`/v1/garage/jobs/${jobId}`).set(asGarage(managerToken)).expect(200);
    expect(job.body.ownerConfirmation).toBe('confirmed');
    const logged = await db.query(`SELECT params FROM notify.outbound_messages WHERE purpose = 'attestation'`);
    expect(logged.rows[0].params.link).toBe('[redacted]');
  });

  it('a car new to SAZO needs a plate photo, then becomes a provisional vehicle (D-057, P-010)', async () => {
    const id = randomUUID();
    const photo = await upload(mechanicToken, 'odometer_photo', 'odometer 41000');
    const draft = { plateEntered: 'UBZ 999Z', workTypes: ['service', 'engine'], clientCreatedAt: new Date().toISOString(),
      form: { mileage: { value: 41000, odometerPhotoId: photo }, service: { items: ['engine_oil'] }, engine: { replaced: true, newEngineNumber: '2ZR-X123456' } } };
    await http.put(`/v1/garage/jobs/${id}`).set(asGarage(mechanicToken)).send(draft).expect(200);

    const incomplete = await http.post(`/v1/garage/jobs/${id}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', randomUUID()).send({}).expect(400);
    expect(incomplete.body.errors.map((e: { path: string }) => e.path)).toEqual(['form.engine.newEngineNumberPhotoId']);

    const enginePhoto = await upload(mechanicToken, 'engine_number_photo', 'engine number 2ZR');
    // Wrong kind in the wrong slot is caught.
    await http.put(`/v1/garage/jobs/${id}`).set(asGarage(mechanicToken))
      .send({ ...draft, form: { ...draft.form, engine: { ...draft.form.engine, newEngineNumberPhotoId: photo } } }).expect(200);
    expect((await http.post(`/v1/garage/jobs/${id}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', randomUUID()).send({}).expect(422)).body.code).toBe('evidence_invalid');

    await http.put(`/v1/garage/jobs/${id}`).set(asGarage(mechanicToken))
      .send({ ...draft, form: { ...draft.form, engine: { ...draft.form.engine, newEngineNumberPhotoId: enginePhoto } } }).expect(200);
    expect((await http.post(`/v1/garage/jobs/${id}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', randomUUID()).send({}).expect(422)).body.code).toBe('plate_photo_required');

    const platePhoto = await upload(mechanicToken, 'plate_photo', 'plate UBZ 999Z');
    await http.put(`/v1/garage/jobs/${id}`).set(asGarage(mechanicToken))
      .send({ ...draft, form: { ...draft.form, engine: { ...draft.form.engine, newEngineNumberPhotoId: enginePhoto }, evidenceIds: [platePhoto] } }).expect(200);
    const res = await http.post(`/v1/garage/jobs/${id}/submit`).set(asGarage(mechanicToken)).set('Idempotency-Key', randomUUID()).send({}).expect(202);
    expect(res.body).toMatchObject({ jobStatus: 'accepted', ownerConfirmation: 'not_requested' });

    const search = await http.get('/v1/vehicles/search').query({ q: 'UBZ 999Z' }).expect(200);
    expect(search.body.matches[0]).toMatchObject({ vehicleRef: res.body.vehicleRef, status: 'provisional' });
    const report = await http.get(`/v1/vehicles/${res.body.vehicleRef}/report`).set(bearer(adminToken)).expect(200);
    expect(report.body.facts.find((f: { key: string }) => f.key === 'current_engine_number')?.value).toBe('2ZR-X123456');
  });

  it('the job list shows both jobs, newest first', async () => {
    const list = await http.get('/v1/garage/jobs').set(asGarage(managerToken)).expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.every((j: { status: string }) => j.status === 'accepted')).toBe(true);
    expect(list.body.items[1].jobId).toBe(jobId);
  });
});
