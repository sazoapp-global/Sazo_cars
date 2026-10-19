// Dealership system, step 1 (D-125): add a car before its chassis number is known, link it later, import
// stages and the two clocks (D-124), commission terms (D-126, D-129), the append-only cost ledger, car photos
// and dealer settings. Over HTTP on a fresh database.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { signInWithCode } from './test-auth.js';
import { testPhoto } from './test-photos.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!base)('dealer cars, costs and clocks (e2e)', () => {
  const dbName = `sazo_dcars_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  let otherOrg: string;
  let otherManager: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const as = (t: string, org = orgId) => ({ ...bearer(t), 'X-Organisation-Id': org });
  const signIn = (phone: string, name?: string) => signInWithCode(app, http, phone, name);

  async function upload(token: string, kind: string, seed: string): Promise<string> {
    const bytes = await testPhoto(seed);
    const slot = await http.post('/v1/evidence/uploads').set(bearer(token))
      .send({ kind, mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }).expect(201);
    await http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(token)).set('Content-Type', 'image/jpeg').send(bytes).expect(204);
    return (await http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(token)).expect(200)).body.evidenceId;
  }

  async function dealer(phone: string, name: string, adminToken: string) {
    const t = await signIn(phone, name);
    const id = (await http.post('/v1/organisations').set(bearer(t)).send({ type: 'dealer', legalName: `${name} Ltd` }).expect(201)).body.id;
    await http.post(`/v1/admin/organisations/${id}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Yard visited' }).expect(200);
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
    const adminId = await app.get(IamService).ensureUser('+256700000994', 'Test Admin', 'sazo_admin');
    const adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    ({ t: manager, id: orgId } = await dealer('+256772600001', 'Kyambogo Motors', adminToken));
    ({ t: otherManager, id: otherOrg } = await dealer('+256772600009', 'Nakawa Bond', adminToken));
    await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772600002', displayName: 'Ruth Sales', role: 'org_staff' }).expect(201);
    staff = await signIn('+256772600002');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  let carId: string;

  it('adds a car in step 1 without a chassis number; it is not in SAZO history or the cars for sale yet', async () => {
    expect((await http.post('/v1/dealer/stock').set(as(staff)).send({ askingPriceUgx: 75_000_000 }).expect(400)).body.code).toBe('make_required');
    expect((await http.post('/v1/dealer/stock').set(as(staff)).send({ askingPriceUgx: 75_000_000, mileageKm: 40000, details: { make: 'toyota' } }).expect(400)).body.code).toBe('link_first');
    const res = await http.post('/v1/dealer/stock').set(as(staff)).send({ askingPriceUgx: 75_000_000,
      details: { make: 'toyota', model: 'harrier', modelYear: 2018, engineCc: 2000, fuel: 'petrol', yard: 'kyambogo yard', stage: 'shipping' } }).expect(201);
    carId = res.body.stockId;
    expect(res.body).toMatchObject({ linked: false, status: 'in_stock', askingPriceUgx: 75_000_000,
      details: { make: 'Toyota', model: 'Harrier', modelYear: 2018, stage: 'shipping', yard: 'Kyambogo Yard', openToBrokers: true, commissionKind: null },
      clocks: { daysInStock: 0, stockAgeLevel: 0, stockAgeAlertDays: [90, 180, 240] } });
    expect(res.body.vehicleRef).toBeUndefined();
    expect(res.body.costTotalUgx).toBeUndefined(); // sales staff never see costs
    const buyer = await signIn('+256772600050', 'A buyer');
    expect(JSON.stringify((await http.get('/v1/cars-for-sale').set(bearer(buyer)).expect(200)).body)).not.toContain(carId);
    // The asking price can change before linking without touching any car's history.
    await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ askingPriceUgx: 74_000_000 }).expect(200);
  });

  it('links the car with its chassis number: the listing and the typed make join SAZO history', async () => {
    const odometer = await upload(staff, 'odometer_photo', 'harrier odometer');
    const res = await http.post(`/v1/dealer/stock/${carId}/link`).set(as(staff)).send({ chassisNumber: 'ZSU60-0099887', mileageKm: 41000, odometerPhotoId: odometer }).expect(200);
    expect(res.body).toMatchObject({ linked: true, listedMileageKm: 41000, vehicle: { make: 'Toyota', model: 'Harrier', status: 'provisional' } });
    expect(res.body.vehicleRef).toMatch(/^SZV-/);
    expect((await http.post(`/v1/dealer/stock/${carId}/link`).set(as(staff)).send({ chassisNumber: 'ZSU60-0099887' }).expect(409)).body.code).toBe('already_linked');
    const ledger = (await http.get(`/v1/vehicles/${res.body.vehicleRef}/evidence`).set(bearer(manager)).expect(200)).body.items;
    expect(ledger.find((i: { type: string }) => i.type === 'listing_published').attributes.askingPrice.amount).toBe(74_000_000);
    expect(ledger.some((i: { type: string; evidenceClass: string }) => i.type === 'spec_declared' && i.evidenceClass === 'dealer')).toBe(true);
  });

  it('keeps the two clocks apart: days in stock against the dealer’s levels, and the customs bond deadline with any extension', async () => {
    let r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ details: { stage: 'in_bond', receivedOn: isoDay(-100), bondArrivedOn: isoDay(-170), customsStatus: 'in_bond', customsDeadline: isoDay(10) } }).expect(200);
    expect(r.body.clocks).toMatchObject({ daysInStock: 100, stockAgeLevel: 1, bond: { applies: true, daysInBond: 170, daysLeft: 10, level: 'soon' } });
    r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ details: { customsExtensionUntil: isoDay(90) } }).expect(200);
    expect(r.body.clocks.bond).toMatchObject({ deadline: isoDay(90), daysLeft: 90, level: 'ok' });
    r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ details: { customsExtensionUntil: null, customsDeadline: isoDay(-2) } }).expect(200);
    expect(r.body.clocks.bond.level).toBe('overdue');
    // No deadline entered: SAZO does not invent one.
    r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ details: { customsDeadline: null } }).expect(200);
    expect(r.body.clocks.bond).toMatchObject({ applies: true, deadline: null, level: 'none' });
    // Released from the bond: the bond clock stops applying, days in stock carry on.
    r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ details: { stage: 'at_yard', customsStatus: 'released' } }).expect(200);
    expect(r.body.clocks).toMatchObject({ daysInStock: 100, bond: { applies: false } });
    await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ details: { stage: 'on_the_moon' } }).expect(400);
    // Every change is in the audit log with what it was before.
    const audit = await db.query(`SELECT details FROM iam.audit_entries WHERE action = 'dealer.car_updated' AND target_id = $1 ORDER BY at`, [carId]);
    expect(audit.rows[0].details.before.stage).toBe('shipping');
  });

  it('commission terms are for managers; fixed or a percentage of the price, never both', async () => {
    let r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(staff)).send({ details: { commissionKind: 'fixed', commissionFixedUgx: 900_000 } }).expect(200);
    expect(r.body.details.commissionKind).toBeNull(); // ignored for sales staff
    expect((await http.patch(`/v1/dealer/stock/${carId}`).set(as(manager)).send({ details: { commissionKind: 'fixed' } }).expect(400)).body.code).toBe('commission_incomplete');
    r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(manager)).send({ details: { commissionKind: 'fixed', commissionFixedUgx: 500_000 } }).expect(200);
    expect(r.body.details).toMatchObject({ commissionKind: 'fixed', commissionFixedUgx: 500_000, commissionPercent: null });
    r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(manager)).send({ details: { commissionKind: 'percent', commissionPercent: 1.5 } }).expect(200);
    expect(r.body.details).toMatchObject({ commissionKind: 'percent', commissionPercent: 1.5, commissionFixedUgx: null });
    await http.patch(`/v1/dealer/stock/${carId}`).set(as(manager)).send({ details: { commissionPercent: 25 } }).expect(400);
    r = await http.patch(`/v1/dealer/stock/${carId}`).set(as(manager)).send({ details: { openToBrokers: false } }).expect(200);
    expect(r.body.details.openToBrokers).toBe(false);
  });

  it('the cost ledger keeps the original currency and rate, is for managers only, and corrections are reversals', async () => {
    expect((await http.get(`/v1/dealer/stock/${carId}/costs`).set(as(staff)).expect(403)).body.detail).toContain('manager');
    await http.post(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).send({ category: 'purchase', amount: 1_200_000, currency: 'JPY' }).expect(400);
    const purchase = (await http.post(`/v1/dealer/stock/${carId}/costs`).set(as(manager))
      .send({ category: 'purchase', amount: 1_200_000, currency: 'JPY', rateToUgx: 25.5, note: 'auction sheet 4.5' }).expect(201)).body;
    expect(purchase).toMatchObject({ amount: 1_200_000, currency: 'JPY', rateToUgx: 25.5, amountUgx: 30_600_000 });
    await http.post(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).send({ category: 'freight_insurance', amount: 1500, currency: 'USD', rateToUgx: 3700, shareRule: 'split equally across 4 cars in the container' }).expect(201);
    const wrong = (await http.post(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).send({ category: 'clearing_agent', amount: 9_000_000 }).expect(201)).body;
    let ledger = (await http.get(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).expect(200)).body;
    expect(ledger.totalUgx).toBe(30_600_000 + 5_550_000 + 9_000_000);
    await http.post(`/v1/dealer/stock/${carId}/costs/${wrong.id}/reverse`).set(as(manager)).send({ reason: 'typed one zero too many' }).expect(201);
    expect((await http.post(`/v1/dealer/stock/${carId}/costs/${wrong.id}/reverse`).set(as(manager)).send({ reason: 'again' }).expect(409)).body.code).toBe('already_reversed');
    await http.post(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).send({ category: 'clearing_agent', amount: 900_000 }).expect(201);
    ledger = (await http.get(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).expect(200)).body;
    expect(ledger.totalUgx).toBe(30_600_000 + 5_550_000 + 900_000);
    expect(ledger.entries).toHaveLength(5);
    expect(ledger.entries.find((e: { id: string }) => e.id === wrong.id).reversedBy).toBeTruthy();
    // The list shows managers the landed cost; sales staff never get it.
    const mine = (await http.get('/v1/dealer/stock').set(as(manager)).expect(200)).body.items.find((i: { stockId: string }) => i.stockId === carId);
    expect(mine.costTotalUgx).toBe(37_050_000);
    expect(JSON.stringify((await http.get('/v1/dealer/stock').set(as(staff)).expect(200)).body)).not.toContain('costTotalUgx');
    // Append-only in the database itself.
    await expect(db.query(`UPDATE dealer.cost_entries SET amount_ugx = 1 WHERE id = $1`, [purchase.id])).rejects.toThrow(/append-only/);
    // Another dealer cannot see this car or its costs.
    await http.get(`/v1/dealer/stock/${carId}/costs`).set(as(otherManager, otherOrg)).expect(404);
  });

  it('car photos must be vehicle photos taken at this dealer, and only this dealer’s staff can open them', async () => {
    const outsider = await upload(otherManager, 'vehicle_photo', 'another yard');
    expect((await http.post(`/v1/dealer/stock/${carId}/photos`).set(as(staff)).send({ evidenceId: outsider }).expect(422)).body.code).toBe('photo_not_allowed');
    const odo = await upload(staff, 'odometer_photo', 'not a car photo');
    await http.post(`/v1/dealer/stock/${carId}/photos`).set(as(staff)).send({ evidenceId: odo }).expect(422);
    const front = await upload(staff, 'vehicle_photo', 'harrier front');
    const p = (await http.post(`/v1/dealer/stock/${carId}/photos`).set(as(staff)).send({ evidenceId: front }).expect(201)).body;
    await http.post(`/v1/dealer/stock/${carId}/photos`).set(as(staff)).send({ evidenceId: front }).expect(422);
    // A colleague who did not take the photo can still see it through the dealer route.
    const img = await http.get(`/v1/dealer/stock/${carId}/photos/${p.photoId}`).set(as(manager)).expect(200);
    expect(img.headers['content-type']).toMatch(/^image\//);
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    await http.get(`/v1/dealer/stock/${carId}/photos/${p.photoId}`).set(as(otherManager, otherOrg)).expect(404);
    const view = (await http.get(`/v1/dealer/stock/${carId}`).set(as(staff)).expect(200)).body;
    expect(view.photos).toEqual([{ photoId: p.photoId, position: 0 }]);
    await http.delete(`/v1/dealer/stock/${carId}/photos/${p.photoId}`).set(as(staff)).expect(204);
    await http.get(`/v1/dealer/stock/${carId}/photos/${p.photoId}`).set(as(manager)).expect(404);
  });

  it('dealer settings: staff can read them, managers change them', async () => {
    expect((await http.get('/v1/dealer/settings').set(as(staff)).expect(200)).body).toEqual({ stockAgeAlertDays: [90, 180, 240], leadProtectionDays: 30 });
    await http.put('/v1/dealer/settings').set(as(staff)).send({ stockAgeAlertDays: [60], leadProtectionDays: 14 }).expect(403);
    expect((await http.put('/v1/dealer/settings').set(as(manager)).send({ stockAgeAlertDays: [120, 60], leadProtectionDays: 14 }).expect(200)).body)
      .toEqual({ stockAgeAlertDays: [60, 120], leadProtectionDays: 14 });
    const view = (await http.get(`/v1/dealer/stock/${carId}`).set(as(staff)).expect(200)).body;
    expect(view.clocks).toMatchObject({ stockAgeAlertDays: [60, 120], stockAgeLevel: 1 });
  });

  it('once sold, costs are frozen and the manager sees the margin; buyers never see costs or the sale price', async () => {
    await http.post(`/v1/dealer/stock/${carId}/sold`).set(as(staff)).send({ salePriceUgx: 72_000_000 }).expect(200);
    expect((await http.post(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).send({ category: 'other', amount: 1000 }).expect(409)).body.code).toBe('costs_locked');
    const sold = (await http.get(`/v1/dealer/stock/${carId}`).set(as(manager)).expect(200)).body;
    expect(sold).toMatchObject({ status: 'sold', costTotalUgx: 37_050_000, marginUgx: 72_000_000 - 37_050_000 });
    const buyer = await signIn('+256772600051', 'Another buyer');
    const ledger = JSON.stringify((await http.get(`/v1/vehicles/${sold.vehicleRef}/evidence`).set(bearer(buyer)).expect(200)).body);
    expect(ledger).not.toContain('72000000');
    expect(ledger).not.toContain('30600000');
  });
});
