// The inspector journey over HTTP on a fresh database (P-004, P-005): approval, lookup, checklist drafts,
// findings that differ from the records, the report file SAZO writes, and what buyers then see.
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

describe.skipIf(!base)('inspector workspace (e2e)', () => {
  const dbName = `sazo_insp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let managerToken: string;
  let inspectorToken: string;
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
    const adminId = await app.get(IamService).ensureUser('+256700000996', 'Test Admin', 'sazo_admin');
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

  it('an inspection centre is approved and adds an inspector; garages cannot record inspections', async () => {
    managerToken = await signIn('+256772400001', 'Ruth (Centre manager)');
    orgId = (await http.post('/v1/organisations').set(bearer(managerToken)).send({ type: 'inspection_centre', legalName: 'Kampala Vehicle Inspection Ltd', tradingName: 'KVI Bugolobi' }).expect(201)).body.id;
    expect((await http.get('/v1/inspections').set(asOrg(managerToken)).expect(403)).body.code).toBe('organisation_not_approved');
    await http.post(`/v1/admin/organisations/${orgId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Licence and premises checked' }).expect(200);

    await http.post('/v1/garage/staff').set(asOrg(managerToken)).send({ phone: '+256772400002', displayName: 'Denis (Inspector)', role: 'org_staff' }).expect(201);
    inspectorToken = await signIn('+256772400002');
    // The inspection centre is not a garage, and a garage is not an inspector.
    expect((await http.get('/v1/garage/jobs').set(asOrg(inspectorToken)).expect(403)).body.code).toBe('not_a_garage');
    const garageOwner = await signIn('+256772400009', 'Garage owner');
    const garageId = (await http.post('/v1/organisations').set(bearer(garageOwner)).send({ type: 'garage', legalName: 'Some Garage Ltd' }).expect(201)).body.id;
    await http.post(`/v1/admin/organisations/${garageId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Workshop checked' }).expect(200);
    expect((await http.get('/v1/inspections').set({ ...bearer(garageOwner), 'X-Organisation-Id': garageId }).expect(403)).body.code).toBe('not_an_inspector');
  });

  const id = randomUUID();
  let vehicleRef: string;
  let draft: Record<string, unknown> & { form: Record<string, unknown> };

  it('the checklist is saved as a draft; sending it early says what is missing', async () => {
    const found = await http.get('/v1/inspections/vehicles/lookup').query({ plate: 'ubr202b' }).set(asOrg(inspectorToken)).expect(200);
    expect(found.body.candidates[0]).toMatchObject({ make: 'Toyota', model: 'Corolla Axio', colour: 'Silver', lastMileage: { km: 120000 } });
    vehicleRef = found.body.candidates[0].vehicleRef;
    draft = { plateEntered: 'UBR 202B', vehicleRef, clientCreatedAt: new Date(Date.now() - 3600_000).toISOString(), form: { tyres: { minTreadPercent: 35 } } };
    const v1 = await http.put(`/v1/inspections/${id}`).set(asOrg(inspectorToken)).send(draft).expect(200);
    expect(v1.body).toMatchObject({ status: 'draft', version: 1, vehicleRef, createdBy: { displayName: 'Denis (Inspector)' } });
    expect(v1.body.publicRef).toMatch(/^IN-\d{4}-\d{5}$/);
    const early = await http.post(`/v1/inspections/${id}/submit`).set(asOrg(inspectorToken)).set('Idempotency-Key', randomUUID()).send({}).expect(400);
    expect(early.body.errors.map((e: { path: string }) => e.path)).toEqual(['form.mileage', 'form.mileage.odometerPhotoId', 'form.structure', 'form.photoIds', 'form.result']);
  });

  it('findings that differ from the records must be explained, then the inspection is recorded with a fingerprinted report', async () => {
    const odometer = await upload(inspectorToken, 'odometer_photo', 'odometer 118000');
    const front = await upload(inspectorToken, 'vehicle_photo', 'front of car');
    const back = await upload(inspectorToken, 'vehicle_photo', 'back of car');
    draft.form = {
      mileage: { value: 118000, unit: 'km', odometerPhotoId: odometer },
      identity: { colourSeen: 'Pearl white', engineNumberSeen: '1NZ-D777777' },
      paint: { readings: [{ panel: 'bonnet', microns: 410 }, { panel: 'roof', microns: 110 }] },
      structure: { damageFound: true, areas: ['chassis_rails'], severity: 'moderate' },
      tyres: { minTreadPercent: 35 }, battery: { ok: true },
      defects: [{ item: 'Front brake pads worn', severity: 'major' }],
      result: { passed: false, summary: 'Front-end repair visible; brakes need work' },
      photoIds: [front, back],
    };
    await http.put(`/v1/inspections/${id}`).set(asOrg(inspectorToken)).send({ ...draft, version: 1 }).expect(200);

    const key = randomUUID();
    const warned = await http.post(`/v1/inspections/${id}/submit`).set(asOrg(inspectorToken)).set('Idempotency-Key', key).send({}).expect(422);
    expect(warned.body.errors.map((w: { code: string }) => w.code)).toEqual(['mileage_lower_than_last', 'colour_differs']);
    const ack = { acknowledgedWarnings: [
      { code: 'mileage_lower_than_last', explanation: 'Read twice; photo attached' },
      { code: 'colour_differs', explanation: 'Car has been resprayed white' },
    ] };
    const res = await http.post(`/v1/inspections/${id}/submit`).set(asOrg(inspectorToken)).set('Idempotency-Key', key).send(ack).expect(202);
    expect(res.body).toMatchObject({ status: 'accepted', vehicleRef });
    expect((await http.post(`/v1/inspections/${id}/submit`).set(asOrg(inspectorToken)).set('Idempotency-Key', key).send(ack).expect(202)).body.submissionId).toBe(res.body.submissionId);
    await http.post(`/v1/inspections/${id}/submit`).set(asOrg(inspectorToken)).set('Idempotency-Key', randomUUID()).send(ack).expect(409);
    await http.put(`/v1/inspections/${id}`).set(asOrg(inspectorToken)).send(draft).expect(409);

    // The report SAZO wrote: the checklist, who, when, and every photo's fingerprint. Only reviewers (and the uploader) can open it.
    const { rows } = await db.query(`SELECT report_evidence_id FROM inspection.inspections WHERE id = $1`, [id]);
    const file = await http.get(`/v1/evidence/${rows[0].report_evidence_id}/content`).set(bearer(adminToken)).expect(200);
    const report = JSON.parse(file.text);
    expect(report).toMatchObject({ organisation: 'KVI Bugolobi', inspector: 'Denis (Inspector)', plate: 'UBR 202B', vehicleRef, repaintedPanels: ['Bonnet'] });
    expect(report.photos.map((p: { sha256: string }) => p.sha256)).toContain(createHash('sha256').update('front of car').digest('hex'));
  });

  it('buyers see the inspection: structural damage, the repaint note, and the latest inspection card', async () => {
    const buyer = await signIn('+256772400050', 'A buyer');
    const r = (await http.get(`/v1/vehicles/${vehicleRef}/report`).set(bearer(buyer)).expect(200)).body;
    const damage = r.questions.find((q: { question: string }) => q.question === 'damage');
    expect(damage).toMatchObject({ status: 'serious', headlineKey: 'damage.serious.structural' });
    expect(damage.notes).toContainEqual({ key: 'damage.note.repainted_panels', params: { panels: 1, on: expect.any(String) } });
    expect(r.latestInspection).toMatchObject({
      sourceLabel: 'Inspection · KVI Bugolobi', passed: false, structuralFindings: true, tyresPercent: 35, batteryOk: true,
      defects: [{ item: 'Front brake pads worn', severity: 'major' }], panelsMeasured: 2, repaintedPanels: ['bonnet'], photos: 2,
    });
    expect(r.ruleSetVersion).toBe('rs-2026.10-v1.1');
    // The ledger shows the inspection with its report; inspectors' sources never appear in the partner console.
    const ledger = (await http.get(`/v1/vehicles/${vehicleRef}/evidence`).set(bearer(buyer)).expect(200)).body.items;
    const result = ledger.find((i: { type: string }) => i.type === 'inspection_result');
    expect(result.evidence.map((e: { kind: string }) => e.kind)).toEqual(expect.arrayContaining(['inspection_report', 'vehicle_photo']));
    const sources = (await http.get('/v1/ingest/sources').set(bearer(managerToken)).expect(200)).body;
    expect(JSON.stringify(sources)).not.toContain('INS-');
  });

  it('a car new to SAZO needs the chassis number read off the car', async () => {
    const newId = randomUUID();
    const odometer = await upload(inspectorToken, 'odometer_photo', 'odometer new car');
    const photos = [await upload(inspectorToken, 'vehicle_photo', 'new car front'), await upload(inspectorToken, 'vehicle_photo', 'new car back')];
    const body = { plateEntered: 'UBZ 404Z', clientCreatedAt: new Date().toISOString(), form: {
      mileage: { value: 64000, unit: 'km', odometerPhotoId: odometer }, structure: { damageFound: false, areas: [] }, result: { passed: true }, photoIds: photos } };
    await http.put(`/v1/inspections/${newId}`).set(asOrg(inspectorToken)).send(body).expect(200);
    expect((await http.post(`/v1/inspections/${newId}/submit`).set(asOrg(inspectorToken)).set('Idempotency-Key', randomUUID()).send({}).expect(422)).body.code).toBe('chassis_required');

    const chassisPhoto = await upload(inspectorToken, 'vehicle_photo', 'chassis stamp');
    const v = await http.get(`/v1/inspections/${newId}`).set(asOrg(inspectorToken)).expect(200);
    await http.put(`/v1/inspections/${newId}`).set(asOrg(inspectorToken))
      .send({ ...body, version: v.body.version, form: { ...body.form, identity: { chassisSeen: 'NZE161-7088888', chassisPhotoId: chassisPhoto } } }).expect(200);
    const res = await http.post(`/v1/inspections/${newId}/submit`).set(asOrg(inspectorToken)).set('Idempotency-Key', randomUUID()).send({}).expect(202);
    expect(res.body.status).toBe('accepted');
    expect(res.body.vehicleRef).toMatch(/^SZV-/);
    const list = await http.get('/v1/inspections').set(asOrg(managerToken)).expect(200);
    expect(list.body.items.map((i: { status: string }) => i.status)).toEqual(['accepted', 'accepted']);
  });
});
