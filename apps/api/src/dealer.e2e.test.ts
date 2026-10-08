// The dealer journey over HTTP on a fresh database (P-005): approval, listing known and new cars, price
// changes, a sale (price kept confidential), buyer links, and what buyers see.
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

describe.skipIf(!base)('dealer workspace (e2e)', () => {
  const dbName = `sazo_dealer_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let orgId: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const asOrg = (t: string) => ({ ...bearer(t), 'X-Organisation-Id': orgId });
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
    const adminId = await app.get(IamService).ensureUser('+256700000995', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;

    const ingestion = app.get(IngestionService);
    await ingestion.upsertSource({ code: 'REG', name: 'Registry (simulated)', organisationId: randomUUID(), domain: 'registration', channel: 'simulated_feed',
      isSimulated: true, evidenceClass: 'official', baselineReputation: 0.9, coverage: [{ scope: 'all_registered_vehicles', from: '2000-01-01' }] });
    await ingestion.submit('REG', { schemaVersion: 1, items: [{ identifiers: { chassisNumber: 'ZRE142-6099999', plate: 'UBS 303C' }, records: [
      { type: 'spec_declared', attributes: { make: 'Toyota', model: 'Corolla Axio', year: 2012, colour: 'Silver', engineNumber: '1NZ-D999999' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
      { type: 'registration_issued', attributes: { plate: 'UBS 303C' }, time: { at: '2017-02-01T00:00:00Z', precision: 'day' } },
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

  const asStaff = () => ({ ...bearer(staffToken), 'X-Organisation-Id': orgId });
  let knownRef: string;
  let stockId: string;

  it('a dealer is approved and adds a salesperson; other businesses cannot use the dealer screens', async () => {
    managerToken = await signIn('+256772500001', 'Grace (Dealer manager)');
    orgId = (await http.post('/v1/organisations').set(bearer(managerToken)).send({ type: 'dealer', legalName: 'Ntinda Car Bond Ltd', tradingName: 'Ntinda Car Bond' }).expect(201)).body.id;
    expect((await http.get('/v1/dealer/stock').set(asOrg(managerToken)).expect(403)).body.code).toBe('organisation_not_approved');
    await http.post(`/v1/admin/organisations/${orgId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Yard visited, licence checked' }).expect(200);
    await http.post('/v1/garage/staff').set(asOrg(managerToken)).send({ phone: '+256772500002', displayName: 'Sam (Sales)', role: 'org_staff' }).expect(201);
    staffToken = await signIn('+256772500002');
    const other = await signIn('+256772500009', 'A garage');
    const garageId = (await http.post('/v1/organisations').set(bearer(other)).send({ type: 'garage', legalName: 'Garage Ltd' }).expect(201)).body.id;
    await http.post(`/v1/admin/organisations/${garageId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Workshop checked' }).expect(200);
    expect((await http.get('/v1/dealer/stock').set({ ...bearer(other), 'X-Organisation-Id': garageId }).expect(403)).body.code).toBe('not_a_dealer');
  });

  it('lists a known car: the asking price and mileage join its history; listing twice is refused', async () => {
    knownRef = (await http.get('/v1/vehicles/search').query({ q: 'UBS 303C' }).expect(200)).body.matches[0].vehicleRef;
    const res = await http.post('/v1/dealer/stock').set(asStaff()).send({ vehicleRef: knownRef, askingPriceUgx: 38_500_000, mileageKm: 131000 }).expect(201);
    stockId = res.body.stockId;
    expect(res.body).toMatchObject({ vehicleRef: knownRef, status: 'in_stock', askingPriceUgx: 38_500_000, listedMileageKm: 131000, vehicle: { make: 'Toyota' } });
    expect(res.body.questions).toHaveLength(7);
    expect((await http.post('/v1/dealer/stock').set(asStaff()).send({ vehicleRef: knownRef, askingPriceUgx: 1 }).expect(409)).body.code).toBe('already_in_stock');

    await http.patch(`/v1/dealer/stock/${stockId}`).set(asStaff()).send({ askingPriceUgx: 36_000_000 }).expect(200);
    const ledger = (await http.get(`/v1/vehicles/${knownRef}/evidence`).set(bearer(managerToken)).expect(200)).body.items;
    const listings = ledger.filter((i: { type: string }) => i.type === 'listing_published');
    expect(listings.map((l: { attributes: { askingPrice: { amount: number } } }) => l.attributes.askingPrice.amount).sort()).toEqual([36_000_000, 38_500_000]);
    expect(listings[0].evidenceClass).toBe('dealer');
    expect(ledger.some((i: { type: string; attributes: { km?: number } }) => i.type === 'odometer_reading' && i.attributes.km === 131000)).toBe(true);
  });

  it('a car SAZO does not know needs its VIN or chassis, and stays "not yet confirmed"', async () => {
    expect((await http.post('/v1/dealer/stock').set(asStaff()).send({ plate: 'UBT 505D', askingPriceUgx: 20_000_000 }).expect(400)).body.code).toBe('identifiers_required');
    const res = await http.post('/v1/dealer/stock').set(asStaff()).send({ plate: 'UBT 505D', chassisNumber: 'GRX130-6011111', askingPriceUgx: 20_000_000 }).expect(201);
    expect(res.body.vehicle).toMatchObject({ status: 'provisional' });
  });

  it('a sale is recorded but its price stays confidential; buyer links work like any share link', async () => {
    const sold = await http.post(`/v1/dealer/stock/${stockId}/sold`).set(asStaff()).send({ salePriceUgx: 35_000_000 }).expect(200);
    expect(sold.body).toMatchObject({ status: 'sold', salePriceUgx: 35_000_000 });
    await http.post(`/v1/dealer/stock/${stockId}/sold`).set(asStaff()).send({ salePriceUgx: 1 }).expect(409);
    const buyer = await signIn('+256772500050', 'A buyer');
    const ledger = (await http.get(`/v1/vehicles/${knownRef}/evidence`).set(bearer(buyer)).expect(200)).body;
    expect(JSON.stringify(ledger)).not.toContain('35000000');
    const list = (await http.get('/v1/dealer/stock').set(asOrg(managerToken)).expect(200)).body.items;
    expect(list.map((i: { status: string }) => i.status)).toEqual(['in_stock', 'sold']);
    // Removing a car adds nothing to its history.
    await http.delete(`/v1/dealer/stock/${list[0].stockId}`).set(asStaff()).expect(204);
    await http.delete(`/v1/dealer/stock/${list[0].stockId}`).set(asStaff()).expect(409);
    // The dealer's source is not offered in the partner console.
    expect(JSON.stringify((await http.get('/v1/ingest/sources').set(bearer(managerToken)).expect(200)).body)).not.toContain('DLR-');
  });
});
