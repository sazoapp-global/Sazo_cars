// Many cars at once from a file (D-131): managers only, every row checked first in plain words, costs kept
// from sales staff, cars SAZO does not know added (D-130), and one file added only once. Over HTTP on a fresh database.
import { execFileSync } from 'node:child_process';
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
import { signInWithCode, approveOrg } from './test-auth.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('dealer file import (e2e)', () => {
  const dbName = `sazo_dimp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let manager: string;
  let staff: string;
  let orgId: string;
  let adminToken: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const as = (t: string, org = orgId) => ({ ...bearer(t), 'X-Organisation-Id': org });
  const signIn = (phone: string, name?: string) => signInWithCode(app, http, phone, name);

  async function dealer(phone: string, name: string, adminToken: string) {
    const t = await signIn(phone, name);
    const id = (await http.post('/v1/organisations').set(bearer(t)).send({ type: 'dealer', legalName: `${name} Ltd` }).expect(201)).body.id;
    await approveOrg(app, http, adminToken, id, 'Yard visited');
    return { t, id };
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
    const adminId = await app.get(IamService).ensureUser('+256700000984', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    ({ t: manager, id: orgId } = await dealer('+256772610001', 'Kyambogo Motors', adminToken));
        await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772610002', displayName: 'Ruth Sales', role: 'org_staff' }).expect(201);
    staff = await signIn('+256772610002');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  const row = (o: Record<string, string>) => ({ make: '', model: '', price: '', ...o });
  let importId: string;

  it('only a manager can bring in a file, because it can carry costs', async () => {
    expect((await http.post('/v1/dealer/imports').set(as(staff)).send({ fileName: 'cars.xlsx', rows: [row({ make: 'Toyota', price: '1000000' })] }).expect(403)).body.code).toBe('forbidden');
    expect((await http.post('/v1/dealer/imports').set(as(manager)).send({ fileName: 'cars.xlsx', rows: [] }).expect(400)).body.code).toBe('import_empty');
  });

  it('checks every row first and says in plain words what is wrong; nothing is added yet', async () => {
    const res = await http.post('/v1/dealer/imports').set(as(manager)).send({ fileName: 'October shipment.xlsx', rows: [
      row({ make: 'toyota', model: 'harrier', year: '2018', fuel: 'Petrol', gearbox: 'Auto', chassis: 'ZSU60-0123456', price: '75,000,000', stage: 'Shipping',
        receivedOn: '01/10/2026', costCurrency: 'usd', costRate: '3,700', cost_purchase: '9500', cost_freight_insurance: '1500' }),
      row({ make: 'nissan', model: 'note', plate: 'UBR 101X', price: '18000000', stage: 'At the yard' }),
      row({ make: 'mazda', model: 'demio' }),
      row({ make: 'toyota', chassis: 'ZSU60 0123456', price: '1' }),
      row({ make: 'subaru', price: '30000000', costCurrency: 'JPY', cost_purchase: '900000' }),
    ] }).expect(201);
    importId = res.body.importId;
    expect(res.body).toMatchObject({ status: 'checked', ready: 2, withProblems: 3, results: null });
    const problems = Object.fromEntries(res.body.rows.map((l: { line: number; problems: string[] }) => [l.line, l.problems]));
    expect(problems[2]).toEqual([]);
    expect(problems[3]).toEqual([]);
    expect(problems[4]).toContain('Asking price is missing');
    expect(problems[5]).toContain('The same car as row 2');
    expect(problems[6]).toContain('Rate to UGX is needed for costs in JPY');
    expect((await http.get('/v1/dealer/stock').set(as(manager)).expect(200)).body.items).toHaveLength(0);
    expect((await http.get(`/v1/dealer/imports/${importId}`).set(as(staff)).expect(403)).body.code).toBe('forbidden');
  });

  it('adds the ready rows as if typed on the form: unknown cars join SAZO, costs stay with managers', async () => {
    const res = await http.post(`/v1/dealer/imports/${importId}/add`).set(as(manager)).expect(200);
    expect(res.body.status).toBe('added');
    expect(res.body.results).toHaveLength(2);
    const [harrier, note] = res.body.results;
    expect(harrier).toMatchObject({ line: 2, costsAdded: 2 });
    const asManager = (await http.get(`/v1/dealer/stock/${harrier.stockId}`).set(as(manager)).expect(200)).body;
    expect(asManager).toMatchObject({ linked: true, costTotalUgx: 11000 * 3700, vehicle: { make: 'Toyota', model: 'Harrier', status: 'provisional' },
      details: { stage: 'shipping', receivedOn: '2026-10-01', fuel: 'petrol', transmission: 'automatic' } });
    const asStaff = (await http.get(`/v1/dealer/stock/${harrier.stockId}`).set(as(staff)).expect(200)).body;
    expect(asStaff.costTotalUgx).toBeUndefined();
    await http.get(`/v1/dealer/stock/${harrier.stockId}/costs`).set(as(staff)).expect(403);
    const costs = (await http.get(`/v1/dealer/stock/${harrier.stockId}/costs`).set(as(manager)).expect(200)).body.entries;
    expect(costs.map((c: { category: string; currency: string; amount: number }) => [c.category, c.currency, c.amount])).toEqual(expect.arrayContaining([['purchase', 'USD', 9500], ['freight_insurance', 'USD', 1500]]));
    const noteCar = (await http.get(`/v1/dealer/stock/${note.stockId}`).set(as(manager)).expect(200)).body;
    expect(noteCar).toMatchObject({ linked: true, vehicle: { make: 'Nissan', status: 'provisional' } });
  });

  it('one file is added only once', async () => {
    const again = await http.post(`/v1/dealer/imports/${importId}/add`).set(as(manager)).expect(200);
    expect(again.body.results).toHaveLength(2);
    expect((await http.get('/v1/dealer/stock').set(as(manager)).expect(200)).body.items).toHaveLength(2);
    const sameFile = (await http.get(`/v1/dealer/imports/${importId}`).set(as(manager)).expect(200)).body;
    const cells = [
      row({ make: 'toyota', model: 'harrier', year: '2018', fuel: 'Petrol', gearbox: 'Auto', chassis: 'ZSU60-0123456', price: '75,000,000', stage: 'Shipping',
        receivedOn: '01/10/2026', costCurrency: 'usd', costRate: '3,700', cost_purchase: '9500', cost_freight_insurance: '1500' }),
      row({ make: 'nissan', model: 'note', plate: 'UBR 101X', price: '18000000', stage: 'At the yard' }),
      row({ make: 'mazda', model: 'demio' }),
      row({ make: 'toyota', chassis: 'ZSU60 0123456', price: '1' }),
      row({ make: 'subaru', price: '30000000', costCurrency: 'JPY', cost_purchase: '900000' }),
    ];
    expect(sameFile.fileName).toBe('October shipment.xlsx');
    expect((await http.post('/v1/dealer/imports').set(as(manager)).send({ fileName: 'copy.xlsx', rows: cells }).expect(409)).body.code).toBe('import_already_added');
    // A new file with a car already in stock says so.
    const next = await http.post('/v1/dealer/imports').set(as(manager)).send({ fileName: 'more.csv', rows: [row({ make: 'toyota', chassis: 'ZSU60-0123456', price: '70000000' })] }).expect(201);
    expect(next.body.rows[0].problems).toContain('This car is already in your stock');
  });
});
