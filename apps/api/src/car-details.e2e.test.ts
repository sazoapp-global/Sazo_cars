// The kind of car and the car's other details (D-148) over HTTP on a fresh database: SAZO identifies the kind from
// the chassis code or the model, the registry wins over a dealer, disagreements and cars SAZO cannot tell go to the
// SAZO admins' list, the maker's figures are marked test data, and confirmed owners' fill-ups give the actual fuel use
// once there are 3 measured tanks.
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
import { measure } from './modules/report/fuel.service.js';
import { signInWithCode } from './test-auth.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('fuel measure', () => {
  it('counts the litres after a full tank up to the next full tank; part fills add to the next measure', () => {
    const m = measure([
      { id: 'a', filledOn: '2026-09-01', litres: 50, odometerKm: 10_000, fullTank: true },
      { id: 'b', filledOn: '2026-09-05', litres: 20, odometerKm: 10_250, fullTank: false },
      { id: 'c', filledOn: '2026-09-09', litres: 20, odometerKm: 10_500, fullTank: true },
    ]);
    expect(m.tanks).toBe(1);
    expect(m.items.find((i) => i.id === 'c')!.kmPerL).toBe(12.5);
    expect(m.items.find((i) => i.id === 'a')!.kmPerL).toBeNull();
  });
});

describe.skipIf(!base)('car details and the kind of car (e2e)', () => {
  const dbName = `sazo_kind_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const signIn = (phone: string, name?: string) => signInWithCode(app, http, phone, name);
  const refOf = async (plate: string) => (await http.get('/v1/vehicles/search').query({ q: plate }).expect(200)).body.matches[0].vehicleRef as string;
  const at = (d: string) => ({ at: `${d}T00:00:00Z`, precision: 'day' });

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString(), EVIDENCE_DIR: evidenceDir }));
    await app.init();
    http = request(app.getHttpServer());
    const adminId = await app.get(IamService).ensureUser('+256700000992', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    const ingestion = app.get(IngestionService);
    const source = (code: string, evidenceClass: string) => ingestion.upsertSource({ code, name: `${code} (simulated)`, organisationId: randomUUID(), domain: 'registration',
      channel: 'simulated_feed', isSimulated: true, evidenceClass, baselineReputation: 0.8, coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] } as never);
    await source('REG', 'official');
    await source('DLR', 'dealer');
    await ingestion.submit('REG', { schemaVersion: 1, items: [
      { identifiers: { chassisNumber: 'ZRE142-6088888', plate: 'UBR 303C' }, records: [
        { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Corolla Axio', year: 2012, colour: 'Silver' }, time: at('2017-02-01') },
        { type: 'registration_issued', attributes: { plate: 'UBR 303C' }, time: at('2017-02-01') },
        { type: 'ownership_transferred', attributes: { ownerPhone: '+256772710001' }, time: at('2024-01-10') },
      ] },
      { identifiers: { chassisNumber: 'QQ999-0001111', plate: 'UBH 552C' }, records: [
        { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Land Cruiser', year: 2010 }, time: at('2018-03-01') },
        { type: 'registration_issued', attributes: { plate: 'UBH 552C' }, time: at('2018-03-01') },
      ] },
      { identifiers: { chassisNumber: 'GUN125-3000111', plate: 'UBF 301T' }, records: [
        { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Hilux', year: 2017, kind: 'pickup', seats: 5, powerHp: 148 }, time: at('2019-05-01') },
        { type: 'registration_issued', attributes: { plate: 'UBF 301T' }, time: at('2019-05-01') },
      ] },
    ] }, { idempotencyKey: randomUUID() });
    await ingestion.submit('DLR', { schemaVersion: 1, items: [
      { identifiers: { chassisNumber: 'GUN125-3000111' }, records: [{ type: 'spec_declared', attributes: { make: 'Toyota', model: 'Hilux', kind: 'suv' }, time: at('2026-09-01') }] },
    ] }, { idempotencyKey: randomUUID() });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  it('identifies the kind from the chassis code first, then the model, and asks for a model with two kinds', async () => {
    const t = await signIn('+256772710009', 'A dealer');
    const byCode = (await http.get('/v1/reference/identify').query({ model: 'Noah', chassis: 'KDH200-0012345' }).set(bearer(t)).expect(200)).body;
    expect(byCode).toMatchObject({ kind: 'van', via: 'chassis_code', code: 'KDH200', spec: { model: 'Hiace Van', basis: 'simulated' } });
    const byModel = (await http.get('/v1/reference/identify').query({ make: 'Toyota', model: 'Probox' }).set(bearer(t)).expect(200)).body;
    expect(byModel).toMatchObject({ kind: 'van', via: 'model', spec: { engineCc: 1496, loadTonnes: 0.4 } });
    const mixed = (await http.get('/v1/reference/identify').query({ make: 'Toyota', model: 'Land Cruiser' }).set(bearer(t)).expect(200)).body;
    expect(mixed.reason).toBe('mixed_model');
    expect(mixed.kinds).toEqual(expect.arrayContaining(['suv', 'pickup']));
  });

  it('the report shows the kind and the maker figures marked test data; the public summary shows the kind', async () => {
    const ref = await refOf('UBR 303C');
    const t = await signIn('+256772710008', 'A buyer');
    const r = (await http.get(`/v1/vehicles/${ref}/report`).set(bearer(t)).expect(200)).body;
    const d = Object.fromEntries((r.about.details as { key: string; value: unknown; source: string }[]).map((x) => [x.key, x]));
    expect(d.kind).toMatchObject({ value: 'saloon', source: 'chassis_code' });
    expect(d.engineCc).toMatchObject({ value: 1496, source: 'maker_test' });
    expect(d.year).toMatchObject({ value: 2012, source: 'registry' });
    expect(d.actualKmPerL).toBeUndefined();
    const pub = (await http.get(`/v1/vehicles/${ref}/summary`).expect(200)).body;
    expect(JSON.stringify(pub)).toContain('saloon');
  });

  it('the registry wins over a dealer; both disagreements and unknown kinds go to the admins, who decide with a reason', async () => {
    const hilux = await refOf('UBF 301T');
    const cruiser = await refOf('UBH 552C');
    const t = await signIn('+256772710008');
    const d = Object.fromEntries(((await http.get(`/v1/vehicles/${hilux}/report`).set(bearer(t)).expect(200)).body.about.details as { key: string }[]).map((x) => [x.key, x]));
    expect(d.kind).toMatchObject({ value: 'pickup', source: 'registry' });
    expect(d.seats).toMatchObject({ value: 5, source: 'registry' });
    expect(d.powerHp).toMatchObject({ value: 148 });

    await http.get('/v1/admin/vehicle-kinds').set(bearer(t)).expect(403);
    const q = (await http.get('/v1/admin/vehicle-kinds').set(bearer(adminToken)).expect(200)).body;
    expect(q.needed.map((n: { vehicleRef: string }) => n.vehicleRef)).toContain(cruiser);
    expect(q.needed.map((n: { vehicleRef: string }) => n.vehicleRef)).not.toContain(hilux);
    expect(q.disagree.find((x: { vehicleRef: string }) => x.vehicleRef === hilux)).toMatchObject({ current: 'pickup' });

    await http.post(`/v1/admin/vehicles/${cruiser}/kind`).set(bearer(adminToken)).send({ kind: 'tank' as never, reason: 'Photos' }).expect(400);
    const decided = (await http.post(`/v1/admin/vehicles/${cruiser}/kind`).set(bearer(adminToken)).send({ kind: 'suv', reason: 'station wagon body in the photos' }).expect(201)).body;
    expect(decided.kind).toMatchObject({ value: 'suv', source: 'admin' });
    await http.post(`/v1/admin/vehicles/${hilux}/kind`).set(bearer(adminToken)).send({ kind: 'pickup', reason: 'Registry and photos show a double cab' }).expect(201);
    const after = (await http.get('/v1/admin/vehicle-kinds').set(bearer(adminToken)).expect(200)).body;
    expect(after.needed.map((n: { vehicleRef: string }) => n.vehicleRef)).not.toContain(cruiser);
    expect(after.disagree.map((n: { vehicleRef: string }) => n.vehicleRef)).not.toContain(hilux);
  });

  it('only a confirmed owner logs fill-ups; the report shows the average once there are 3 measured tanks', async () => {
    const ref = await refOf('UBR 303C');
    const stranger = await signIn('+256772710007', 'Not the owner');
    const fill = (t: string, offset: number, litres: number, odometerKm: number, fullTank = true) =>
      http.post(`/v1/me/cars/${ref}/fuel`).set(bearer(t)).send({ filledOn: day(offset), litres, odometerKm, fullTank });
    expect((await fill(stranger, -10, 40, 120_000)).body.code).toBe('not_owner');

    const owner = await signIn('+256772710001', 'Agnes Owner');
    await http.post(`/v1/vehicles/${ref}/ownership-claims`).set(bearer(owner)).send({}).expect(200);
    expect((await fill(owner, 1, 40, 120_000)).status).toBe(400); // not in the future
    await fill(owner, -10, 40, 120_000).expect(201);
    await fill(owner, -8, 40, 120_500).expect(201);
    expect((await fill(owner, -7, 40, 110_000)).body.code).toBe('mileage_lower');
    const second = (await fill(owner, -6, 40, 121_000).expect(201)).body;
    expect(second).toMatchObject({ measuredTanks: 2, average: 12.5 });

    const report = async () => ((await http.get(`/v1/vehicles/${ref}/report`).set(bearer(stranger)).expect(200)).body.about.details as { key: string }[]).find((x) => x.key === 'actualKmPerL');
    expect(await report()).toBeUndefined();
    const wrong = (await fill(owner, -5, 40, 121_400).expect(201)).body.id;
    await http.delete(`/v1/me/cars/${ref}/fuel/${wrong}`).set(bearer(owner)).expect(204);
    await http.delete(`/v1/me/cars/${ref}/fuel/${wrong}`).set(bearer(owner)).expect(404);
    await fill(owner, -4, 40, 121_520).expect(201);
    expect(await report()).toMatchObject({ value: 12.7, source: 'owners', note: 'from 3 measured tanks' });
    const log = (await http.get(`/v1/me/cars/${ref}/fuel`).set(bearer(owner)).expect(200)).body;
    expect(log.items).toHaveLength(4);
    expect(JSON.stringify(await report())).not.toContain('Agnes');
  });
});
