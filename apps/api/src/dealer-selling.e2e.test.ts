// Dealership selling (D-125 step 2): share links that open a public car page with the SAZO summary, enquiries
// from that page or added by staff, and sale stages to completed (which records the sale). Customers stay the
// dealer's own: other dealers and buyers never see them.
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
import { signInWithCode, approveOrg } from './test-auth.js';
import { testPhoto } from './test-photos.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('dealer selling: links, car page, enquiries, sale stages (e2e)', () => {
  const dbName = `sazo_dsell_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  let otherManager: string;
  let otherOrg: string;
  let carId: string;
  let carRef: string;
  let photoId: string;
  let unlinkedId: string;
  let token: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const as = (t: string, org = orgId) => ({ ...bearer(t), 'X-Organisation-Id': org });
  const signIn = (phone: string, name?: string) => signInWithCode(app, http, phone, name);

  async function upload(t: string, kind: string, seed: string): Promise<string> {
    const bytes = await testPhoto(seed);
    const slot = await http.post('/v1/evidence/uploads').set(bearer(t))
      .send({ kind, mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }).expect(201);
    await http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(t)).set('Content-Type', 'image/jpeg').send(bytes).expect(204);
    return (await http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(t)).expect(200)).body.evidenceId;
  }

  async function dealer(phone: string, name: string, adminToken: string) {
    const t = await signIn(phone, name);
    const id = (await http.post('/v1/organisations').set(bearer(t)).send({ type: 'dealer', legalName: `${name} Ltd`, tradingName: name }).expect(201)).body.id;
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
    const adminId = await app.get(IamService).ensureUser('+256700000993', 'Test Admin', 'sazo_admin');
    const adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    ({ t: manager, id: orgId } = await dealer('+256772700001', 'Naguru Auto Bond', adminToken));
    ({ t: otherManager, id: otherOrg } = await dealer('+256772700009', 'Other Bond', adminToken));
    await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772700002', displayName: 'Brian Sales', role: 'org_staff' }).expect(201);
    staff = await signIn('+256772700002');
    const car = (await http.post('/v1/dealer/stock').set(as(staff)).send({ chassisNumber: 'ZRR70-0123456', plate: 'UBQ 101A', askingPriceUgx: 48_000_000,
      notes: 'bought cheap, keep quiet', details: { make: 'Toyota', model: 'Noah', modelYear: 2014, yard: 'Naguru', fuel: 'petrol' } }).expect(201)).body;
    carId = car.stockId;
    carRef = car.vehicleRef;
    const evidenceId = await upload(staff, 'vehicle_photo', 'noah side');
    photoId = (await http.post(`/v1/dealer/stock/${carId}/photos`).set(as(staff)).send({ evidenceId }).expect(201)).body.photoId;
    await http.post(`/v1/dealer/stock/${carId}/costs`).set(as(manager)).send({ category: 'purchase', amount: 31_000_000 }).expect(201);
    await http.patch(`/v1/dealer/stock/${carId}`).set(as(manager)).send({ details: { commissionKind: 'fixed', commissionFixedUgx: 400_000 } }).expect(200);
    await http.put('/v1/dealer/settings').set(as(manager)).send({ stockAgeAlertDays: [90, 180, 240], leadProtectionDays: 30, whatsappE164: '+256772700001' }).expect(200);
    unlinkedId = (await http.post('/v1/dealer/stock').set(as(staff)).send({ askingPriceUgx: 60_000_000, details: { make: 'Mazda', model: 'CX-5' } }).expect(201)).body.stockId;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  it('a link needs a car linked to SAZO; the token is shown once and only its hash is stored', async () => {
    expect((await http.post(`/v1/dealer/stock/${unlinkedId}/links`).set(as(staff)).send({ channel: 'whatsapp' }).expect(409)).body.code).toBe('car_not_linked');
    await http.post(`/v1/dealer/stock/${carId}/links`).set(as(otherManager, otherOrg)).send({ channel: 'whatsapp' }).expect(404);
    const res = await http.post(`/v1/dealer/stock/${carId}/links`).set(as(staff)).send({ channel: 'whatsapp' }).expect(201);
    token = res.body.token;
    expect(res.body).toMatchObject({ channel: 'whatsapp', showDealerName: true, path: `/c/${token}` });
    expect((await db.query(`SELECT count(*)::int AS n FROM dealer.car_links WHERE token_hash = $1`, [createHash('sha256').update(token).digest()])).rows[0].n).toBe(1);
    expect(JSON.stringify((await db.query(`SELECT * FROM dealer.car_links`)).rows)).not.toContain(token);
    const list = (await http.get(`/v1/dealer/stock/${carId}/links`).set(as(manager)).expect(200)).body.items;
    expect(list).toHaveLength(1);
    expect(list[0].token).toBeUndefined();
  });

  it('the public car page shows the car, price, photos and SAZO summary, and nothing private', async () => {
    const page = (await http.get(`/v1/cars/${token}`).expect(200)).body;
    expect(page).toMatchObject({ vehicleRef: carRef, askingPriceUgx: 48_000_000, specs: { make: 'Toyota', model: 'Noah', year: 2014, fuel: 'petrol' },
      photos: [photoId], seller: { kind: 'dealer', name: 'Naguru Auto Bond', whatsapp: '+256772700001' } });
    expect(page.questions).toHaveLength(7);
    const text = JSON.stringify(page);
    for (const secret of ['keep quiet', '31000000', 'Naguru"', '400000', 'commission', 'cost', 'notes', 'yard']) expect(text).not.toContain(secret);
    const img = await http.get(`/v1/cars/${token}/photos/${photoId}`).expect(200);
    expect(img.headers['content-type']).toMatch(/^image\//);
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    await http.get(`/v1/cars/${token}/photos/00000000-0000-4000-8000-000000000000`).expect(404);
    await http.get('/v1/cars/not-a-real-token-at-all-xx').expect(404);
    await http.get('/v1/cars/../dealer/stock').expect(404);
  });

  it('an enquiry from the page needs consent; the same phone about the same car is not counted twice', async () => {
    expect((await http.post(`/v1/cars/${token}/enquiries`).send({ name: 'Peter Okello', phone: '+256701234567', consent: false }).expect(400)).body.code).toBe('consent_required');
    await http.post(`/v1/cars/${token}/enquiries`).send({ name: 'Peter Okello', phone: '0701234567', consent: true }).expect(400);
    expect((await http.post(`/v1/cars/${token}/enquiries`).send({ name: 'peter okello', phone: '+256701234567', consent: true, message: 'is it still available?' }).expect(201)).body).toEqual({ status: 'received' });
    expect((await http.post(`/v1/cars/${token}/enquiries`).send({ name: 'Peter O', phone: '+256701234567', consent: true }).expect(201)).body).toEqual({ status: 'already_received' });
    const leads = (await http.get('/v1/dealer/leads?stage=open').set(as(staff)).expect(200)).body;
    expect(leads.items).toHaveLength(1);
    expect(leads.items[0]).toMatchObject({ stage: 'enquiry', source: 'whatsapp', customer: { name: 'Peter Okello', phone: '+256701234567' }, consentToContact: true,
      message: 'Is it still available?', car: '2014 Toyota Noah', stockId: carId, addedBy: null });
    // The customer's name is encrypted at rest and belongs to this dealer only.
    expect(JSON.stringify((await db.query(`SELECT * FROM dealer.leads`)).rows)).not.toContain('Okello');
    expect((await http.get('/v1/dealer/leads').set(as(otherManager, otherOrg)).expect(200)).body.items).toHaveLength(0);
    expect(JSON.stringify((await http.get(`/v1/vehicles/${carRef}/evidence`).set(bearer(otherManager)).expect(200)).body)).not.toContain('Okello');
  });

  it('staff add walk-in enquiries and move them through the stages; completed records the sale and closes the link', async () => {
    const walkIn = (await http.post('/v1/dealer/leads').set(as(staff)).send({ stockId: carId, name: 'Sarah Nambi', phone: '+256752000111', source: 'walk_in', consent: true }).expect(201)).body;
    expect(walkIn).toMatchObject({ source: 'walk_in', addedBy: 'Brian', stage: 'enquiry' });
    await http.post('/v1/dealer/leads').set(as(staff)).send({ name: 'X', phone: '+256752000111', source: 'broker', consent: true }).expect(400);
    for (const stage of ['viewing', 'negotiation', 'deposit']) await http.patch(`/v1/dealer/leads/${walkIn.leadId}`).set(as(staff)).send({ stage }).expect(200);
    expect((await http.patch(`/v1/dealer/leads/${walkIn.leadId}`).set(as(staff)).send({ stage: 'completed' }).expect(400)).body.code).toBe('sale_price_required');
    const done = (await http.patch(`/v1/dealer/leads/${walkIn.leadId}`).set(as(staff)).send({ stage: 'completed', salePriceUgx: 46_500_000, note: 'paid in full' }).expect(200)).body;
    expect(done).toMatchObject({ stage: 'completed', open: false, salePriceUgx: 46_500_000 });
    expect((await http.get(`/v1/dealer/stock/${carId}`).set(as(manager)).expect(200)).body).toMatchObject({ status: 'sold', salePriceUgx: 46_500_000, marginUgx: 46_500_000 - 31_000_000 });
    expect((await http.patch(`/v1/dealer/leads/${walkIn.leadId}`).set(as(staff)).send({ stage: 'viewing' }).expect(409)).body.code).toBe('lead_closed');
    const events = (await http.get(`/v1/dealer/leads/${walkIn.leadId}/events`).set(as(staff)).expect(200)).body.items;
    expect(events.map((e: { toStage: string }) => e.toStage)).toEqual(['enquiry', 'viewing', 'negotiation', 'deposit', 'completed']);
    expect(events.at(-1)).toMatchObject({ note: 'Paid in full', by: 'Brian' });
    // The car is sold: its page and enquiries stop; the other enquiry can be closed as lost and reopened.
    expect((await http.get(`/v1/cars/${token}`).expect(410)).body.code).toBe('car_not_available');
    await http.post(`/v1/cars/${token}/enquiries`).send({ name: 'Late Buyer', phone: '+256752000999', consent: true }).expect(410);
    const peter = (await http.get('/v1/dealer/leads?stage=open').set(as(staff)).expect(200)).body.items[0];
    expect((await http.patch(`/v1/dealer/leads/${peter.leadId}`).set(as(staff)).send({ stage: 'completed', salePriceUgx: 1 }).expect(410)).body.code).toBe('car_not_available');
    await http.patch(`/v1/dealer/leads/${peter.leadId}`).set(as(staff)).send({ stage: 'lost', note: 'car sold to someone else' }).expect(200);
    await http.patch(`/v1/dealer/leads/${peter.leadId}`).set(as(staff)).send({ stage: 'viewing' }).expect(409);
    await http.patch(`/v1/dealer/leads/${peter.leadId}`).set(as(staff)).send({ stage: 'enquiry' }).expect(200);
    // Event history is append-only in the database.
    await expect(db.query(`DELETE FROM dealer.lead_events`)).rejects.toThrow(/append-only/);
    // Which channels brought enquiries and sales this month.
    const bySource = (await http.get('/v1/dealer/leads').set(as(manager)).expect(200)).body.thisMonthBySource;
    expect(bySource).toEqual(expect.arrayContaining([{ source: 'walk_in', enquiries: 1, completed: 1 }, { source: 'whatsapp', enquiries: 1, completed: 0 }]));
  });

  it('a revoked link stops working at once; links of another dealer cannot be revoked', async () => {
    const car2 = (await http.post('/v1/dealer/stock').set(as(staff)).send({ chassisNumber: 'GRX130-0654321', askingPriceUgx: 30_000_000 }).expect(201)).body.stockId;
    const l = (await http.post(`/v1/dealer/stock/${car2}/links`).set(as(staff)).send({ channel: 'tiktok', showDealerName: false }).expect(201)).body;
    expect((await http.get(`/v1/cars/${l.token}`).expect(200)).body.seller).toMatchObject({ kind: 'dealer', name: null });
    await http.delete(`/v1/dealer/links/${l.linkId}`).set(as(otherManager, otherOrg)).expect(404);
    await http.delete(`/v1/dealer/links/${l.linkId}`).set(as(staff)).expect(204);
    await http.get(`/v1/cars/${l.token}`).expect(410);
  });

  it('one link takes a limited number of enquiries a day', async () => {
    const car3 = (await http.post('/v1/dealer/stock').set(as(staff)).send({ chassisNumber: 'NHP10-0111222', askingPriceUgx: 25_000_000 }).expect(201)).body.stockId;
    const l = (await http.post(`/v1/dealer/stock/${car3}/links`).set(as(staff)).send({ channel: 'facebook' }).expect(201)).body;
    await db.query(`INSERT INTO dealer.leads (organisation_id, stock_item_id, party_id, phone_hash, source, car_link_id, consent_to_contact)
      SELECT $1, $2, gen_random_uuid(), decode(md5(g::text), 'hex'), 'facebook', $3, true FROM generate_series(1, 30) g`, [orgId, car3, l.linkId]);
    expect((await http.post(`/v1/cars/${l.token}/enquiries`).send({ name: 'One More', phone: '+256752000888', consent: true }).expect(429)).body.code).toBe('too_many');
  });
});
