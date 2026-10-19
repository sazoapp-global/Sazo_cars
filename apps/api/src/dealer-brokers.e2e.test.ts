// Brokers (D-121, D-126 to D-129): the identity check, the open marketplace limited to cars dealers opened to
// brokers, broker links and the customer protection period, the dealer's decision when two people claim the
// same customer, and commission records (fixed or percent of price; on hold until decided; approve, paid,
// cancel). A broker never sees a dealer's costs, customers, other brokers' leads or staff.
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
import { ConsoleEmailSender } from './modules/notify/index.js';
import { signInWithCode } from './test-auth.js';
import { testPhoto } from './test-photos.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('brokers: identity check, marketplace, protection, decisions and commissions (e2e)', () => {
  const dbName = `sazo_dbrk_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let manager: string;
  let staff: string;
  let orgId: string;
  let openFixed: string;
  let openPercent: string;
  let closedCar: string;
  let noTerms: string;
  let broker1: string;
  let broker2: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const as = (t: string, org = orgId) => ({ ...bearer(t), 'X-Organisation-Id': org });
  const signIn = (phone: string, name?: string) => signInWithCode(app, http, phone, name);
  const linkToken = (text: string | undefined) => text!.match(/token=([A-Za-z0-9_-]+)/)![1]!;

  async function upload(t: string, kind: string, seed: string): Promise<string> {
    const bytes = await testPhoto(seed);
    const slot = await http.post('/v1/evidence/uploads').set(bearer(t))
      .send({ kind, mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }).expect(201);
    await http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(t)).set('Content-Type', 'image/jpeg').send(bytes).expect(204);
    return (await http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(t)).expect(200)).body.evidenceId;
  }

  /** A person with a full profile (details, phone, confirmed email, password: D-102). */
  async function fullProfile(phone: string, name: string, email: string): Promise<string> {
    const t = await signIn(phone, name);
    await http.post('/v1/me/email').set(bearer(t)).send({ email }).expect(202);
    await http.post('/v1/auth/email/verify').send({ token: linkToken(app.get(ConsoleEmailSender, { strict: false }).latest(email)!.text) }).expect(204);
    await http.put('/v1/me/password').set(bearer(t)).send({ newPassword: `kampala-road-${phone.slice(-3)}` }).expect(204);
    return t;
  }

  async function approvedBroker(phone: string, name: string, email: string, nin: string): Promise<string> {
    const t = await fullProfile(phone, name, email);
    const idPhoto = await upload(t, 'official_document', `${name} national id`);
    await http.post('/v1/broker/application').set(bearer(t)).send({ nin, idPhotoEvidenceId: idPhoto }).expect(201);
    const app1 = (await http.get('/v1/admin/brokers/applications').set(bearer(adminToken)).expect(200)).body.items.find((a: { nin: string }) => a.nin === nin);
    await http.post(`/v1/admin/brokers/applications/${app1.applicationId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'ID checked against the photo' }).expect(200);
    return t;
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
    manager = await signIn('+256772800001', 'Joseph Manager');
    orgId = (await http.post('/v1/organisations').set(bearer(manager)).send({ type: 'dealer', legalName: 'Kyambogo Bond Ltd', tradingName: 'Kyambogo Bond' }).expect(201)).body.id;
    await http.post(`/v1/admin/organisations/${orgId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Yard visited' }).expect(200);
    await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772800002', displayName: 'Lucy Sales', role: 'org_staff' }).expect(201);
    staff = await signIn('+256772800002');
    const add = async (chassis: string, price: number, details: object) =>
      (await http.post('/v1/dealer/stock').set(as(manager)).send({ chassisNumber: chassis, askingPriceUgx: price, notes: 'private note', details }).expect(201)).body.stockId as string;
    openFixed = await add('ZRR70-0555111', 50_000_000, { make: 'Toyota', model: 'Voxy', commissionKind: 'fixed', commissionFixedUgx: 500_000 });
    openPercent = await add('ZRR70-0555222', 40_000_000, { make: 'Toyota', model: 'Noah', commissionKind: 'percent', commissionPercent: 1.5 });
    closedCar = await add('ZRR70-0555333', 30_000_000, { make: 'Nissan', model: 'Note', openToBrokers: false, commissionKind: 'fixed', commissionFixedUgx: 300_000 });
    noTerms = await add('ZRR70-0555444', 20_000_000, { make: 'Honda', model: 'Fit' });
    await http.post(`/v1/dealer/stock/${openFixed}/costs`).set(as(manager)).send({ category: 'purchase', amount: 33_000_000 }).expect(201);
    const photo = await upload(manager, 'vehicle_photo', 'voxy front');
    await http.post(`/v1/dealer/stock/${openFixed}/photos`).set(as(manager)).send({ evidenceId: photo }).expect(201);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  it('becoming a broker needs a full profile, a National ID number and an ID photo, checked by a SAZO admin', async () => {
    const half = await signIn('+256772800010', 'Half Profile');
    const idPhoto = await upload(half, 'official_document', 'half id');
    expect((await http.post('/v1/broker/application').set(bearer(half)).send({ nin: 'CM12345678ABCD', idPhotoEvidenceId: idPhoto }).expect(409)).body.code).toBe('profile_incomplete');
    const t = await fullProfile('+256772800011', 'Moses Broker', 'moses@example.com');
    await http.get('/v1/broker/cars').set(bearer(t)).expect(403);
    await http.post('/v1/broker/application').set(bearer(t)).send({ nin: '12345', idPhotoEvidenceId: idPhoto }).expect(400);
    // The ID photo must be the applicant's own upload of a document.
    expect((await http.post('/v1/broker/application').set(bearer(t)).send({ nin: 'CM90001234ABCD', idPhotoEvidenceId: idPhoto }).expect(422)).body.code).toBe('id_photo_invalid');
    const own = await upload(t, 'official_document', 'moses id');
    await http.post('/v1/broker/application').set(bearer(t)).send({ nin: 'cm90001234abcd', idPhotoEvidenceId: own }).expect(201);
    expect((await http.post('/v1/broker/application').set(bearer(t)).send({ nin: 'CM90001234ABCD', idPhotoEvidenceId: own }).expect(409)).body.code).toBe('already_applied');
    expect((await http.get('/v1/broker/application').set(bearer(t)).expect(200)).body).toMatchObject({ isBroker: false, application: { status: 'pending' } });
    // The ID number is encrypted at rest; SAZO staff without broker.approve cannot see applications.
    expect(JSON.stringify((await db.query(`SELECT * FROM iam.broker_applications`)).rows)).not.toContain('CM90001234ABCD');
    await http.get('/v1/admin/brokers/applications').set(bearer(manager)).expect(403);
    const pending = (await http.get('/v1/admin/brokers/applications').set(bearer(adminToken)).expect(200)).body.items;
    const mine = pending.find((a: { nin: string }) => a.nin === 'CM90001234ABCD');
    expect(mine.person).toMatchObject({ name: 'Broker Moses', phone: '+256772800011' });
    await http.post(`/v1/admin/brokers/applications/${mine.applicationId}/decision`).set(bearer(adminToken)).send({ decision: 'reject', reason: 'photo unreadable' }).expect(200);
    expect((await http.get('/v1/broker/application').set(bearer(t)).expect(200)).body).toMatchObject({ isBroker: false, application: { status: 'rejected', decisionReason: 'Photo unreadable' } });
    // After a rejection the person can apply again; the same ID number cannot back a second account.
    const other = await fullProfile('+256772800012', 'Other Person', 'other@example.com');
    const otherId = await upload(other, 'official_document', 'other id');
    await http.post('/v1/broker/application').set(bearer(other)).send({ nin: 'CM55554444ABCD', idPhotoEvidenceId: otherId }).expect(201);
    expect((await http.post('/v1/broker/application').set(bearer(t)).send({ nin: 'CM55554444ABCD', idPhotoEvidenceId: own }).expect(409)).body.code).toBe('nin_in_use');
  });

  it('approved brokers see only cars dealers opened to brokers with terms, and nothing private', async () => {
    broker1 = await approvedBroker('+256772800021', 'Ivan Kato', 'ivan@example.com', 'CM11112222ABCD');
    broker2 = await approvedBroker('+256772800022', 'Grace Atim', 'grace@example.com', 'CF33334444ABCD');
    expect((await http.get('/v1/broker/application').set(bearer(broker1)).expect(200)).body.isBroker).toBe(true);
    const cars = (await http.get('/v1/broker/cars').set(bearer(broker1)).expect(200)).body.items;
    const ids = cars.map((c: { stockId: string }) => c.stockId);
    expect(ids).toEqual(expect.arrayContaining([openFixed, openPercent]));
    expect(ids).not.toContain(closedCar);
    expect(ids).not.toContain(noTerms);
    const voxy = cars.find((c: { stockId: string }) => c.stockId === openFixed);
    expect(voxy).toMatchObject({ askingPriceUgx: 50_000_000, commission: { kind: 'fixed', amountUgx: 500_000 }, dealer: { name: 'Kyambogo Bond' }, specs: { make: 'Toyota', model: 'Voxy' } });
    expect(cars.find((c: { stockId: string }) => c.stockId === openPercent).commission).toEqual({ kind: 'percent', percent: 1.5 });
    const text = JSON.stringify(cars);
    for (const secret of ['33000000', 'private note', 'Lucy', 'costTotal', 'salePrice']) expect(text).not.toContain(secret);
    await http.get(`/v1/broker/cars/${openFixed}/photos/${voxy.photos[0]}`).set(bearer(broker1)).expect(200);
    await http.get(`/v1/broker/cars/${closedCar}/photos/${voxy.photos[0]}`).set(bearer(broker1)).expect(404);
    expect((await http.post(`/v1/broker/cars/${closedCar}/links`).set(bearer(broker1)).send({ channel: 'whatsapp' }).expect(404)).body.code).toBe('car_not_open');
  });

  let b1Token: string;
  let peterLead: string;

  it('a customer registered through a broker link stays the broker’s; the dealer’s own link credits that broker too', async () => {
    const l1 = (await http.post(`/v1/broker/cars/${openFixed}/links`).set(bearer(broker1)).send({ channel: 'tiktok' }).expect(201)).body;
    b1Token = l1.token;
    const page = (await http.get(`/v1/cars/${b1Token}`).expect(200)).body;
    expect(page.seller).toEqual({ kind: 'broker', name: 'Ivan Kato', dealerName: null, whatsapp: '+256772800021' });
    await http.post(`/v1/cars/${b1Token}/enquiries`).send({ name: 'Peter Mugisha', phone: '+256701111222', consent: true }).expect(201);
    // The same customer later comes through the dealer's own WhatsApp link about another car.
    const dl = (await http.post(`/v1/dealer/stock/${openPercent}/links`).set(as(staff)).send({ channel: 'whatsapp' }).expect(201)).body;
    await http.post(`/v1/cars/${dl.token}/enquiries`).send({ name: 'Peter Mugisha', phone: '+256701111222', consent: true }).expect(201);
    const leads = (await http.get('/v1/dealer/leads?stage=open').set(as(staff)).expect(200)).body.items;
    const peter = leads.filter((l: { customer: { phone: string } }) => l.customer.phone === '+256701111222');
    expect(peter).toHaveLength(2);
    for (const l of peter) expect(l).toMatchObject({ broker: 'Ivan', needsDecision: false });
    expect(peter.find((l: { source: string }) => l.source === 'broker').protectedUntil).toBeTruthy();
    peterLead = peter.find((l: { source: string }) => l.source === 'broker').leadId;
    // The broker sees their own customers with the phone partly hidden; another broker sees none of them.
    const mine = (await http.get('/v1/broker/enquiries').set(bearer(broker1)).expect(200)).body.items;
    expect(mine).toHaveLength(2);
    expect(mine[0].customer.phone).toMatch(/^\+256 70• ••• 222$/);
    expect(JSON.stringify(mine)).not.toContain('+256701111222');
    expect((await http.get('/v1/broker/enquiries').set(bearer(broker2)).expect(200)).body.items).toHaveLength(0);
  });

  it('a second broker claiming the same customer waits for the dealer’s decision; commissions are held until then', async () => {
    const l2 = (await http.post(`/v1/broker/cars/${openFixed}/links`).set(bearer(broker2)).send({ channel: 'whatsapp' }).expect(201)).body;
    // Same car and phone: already received, nothing new.
    expect((await http.post(`/v1/cars/${l2.token}/enquiries`).send({ name: 'Peter M', phone: '+256701111222', consent: true }).expect(201)).body.status).toBe('already_received');
    const l3 = (await http.post(`/v1/broker/cars/${openPercent}/links`).set(bearer(broker2)).send({ channel: 'whatsapp' }).expect(201)).body;
    // The Noah enquiry from the dealer link is still open, so Grace's claim on the same car is "already received" too.
    expect((await http.post(`/v1/cars/${l3.token}/enquiries`).send({ name: 'Peter M', phone: '+256701111222', consent: true }).expect(201)).body.status).toBe('already_received');
    // A new customer of Grace's that the dealer already knew (a walk-in) needs a decision.
    await http.post('/v1/dealer/leads').set(as(staff)).send({ name: 'Ann Nakato', phone: '+256702222333', source: 'walk_in', consent: true }).expect(201);
    await http.post(`/v1/cars/${l3.token}/enquiries`).send({ name: 'Ann Nakato', phone: '+256702222333', consent: true }).expect(201);
    const ann = (await http.get('/v1/dealer/leads?stage=open').set(as(staff)).expect(200)).body.items.find((l: { source: string; customer: { name: string } }) => l.source === 'broker' && l.customer.name === 'Ann Nakato');
    expect(ann).toMatchObject({ broker: 'Grace', needsDecision: true, earlier: { by: 'Your team', broker: false } });
    // The sale completes before the decision: Grace's commission is on hold.
    await http.patch(`/v1/dealer/leads/${ann.leadId}`).set(as(staff)).send({ stage: 'completed', salePriceUgx: 39_000_000 }).expect(200);
    let comms = (await http.get('/v1/dealer/commissions').set(as(manager)).expect(200)).body.items;
    expect(comms).toEqual([expect.objectContaining({ broker: 'Grace', status: 'on_hold', kind: 'percent', percent: 1.5, amountUgx: 585_000 })]);
    await http.get('/v1/dealer/commissions').set(as(staff)).expect(403);
    expect((await http.post(`/v1/dealer/commissions/${comms[0].commissionId}/approve`).set(as(manager)).send({}).expect(409)).body.code).toBe('commission_state');
    // Only managers decide; the decision and reason are kept, and the commission follows it.
    await http.post(`/v1/dealer/leads/${ann.leadId}/decision`).set(as(staff)).send({ outcome: 'dealer', reason: 'she walked in first' }).expect(403);
    await http.post(`/v1/dealer/leads/${ann.leadId}/decision`).set(as(manager)).send({ outcome: 'split', reason: 'x' }).expect(400);
    const decided = (await http.post(`/v1/dealer/leads/${ann.leadId}/decision`).set(as(manager)).send({ outcome: 'dealer', reason: 'she walked in two weeks before' }).expect(200)).body;
    expect(decided).toMatchObject({ broker: null, needsDecision: false });
    comms = (await http.get('/v1/dealer/commissions').set(as(manager)).expect(200)).body.items;
    expect(comms[0]).toMatchObject({ status: 'cancelled' });
    expect((await db.query(`SELECT outcome, reason FROM dealer.lead_decisions`)).rows).toEqual([{ outcome: 'dealer', reason: 'She walked in two weeks before' }]);
    await expect(db.query(`UPDATE dealer.lead_decisions SET reason = 'x'`)).rejects.toThrow(/append-only/);
    expect((await http.post(`/v1/dealer/leads/${ann.leadId}/decision`).set(as(manager)).send({ outcome: 'keep', reason: 'again' }).expect(409)).body.code).toBe('no_decision_needed');
  });

  it('a completed broker sale gives a fixed commission, approved then marked paid; the broker’s statement shows it', async () => {
    await http.patch(`/v1/dealer/leads/${peterLead}`).set(as(staff)).send({ stage: 'completed', salePriceUgx: 48_000_000 }).expect(200);
    const c = (await http.get('/v1/dealer/commissions').set(as(manager)).expect(200)).body.items.find((x: { broker: string }) => x.broker === 'Ivan');
    expect(c).toMatchObject({ status: 'pending', kind: 'fixed', amountUgx: 500_000, salePriceUgx: 48_000_000, sharePercent: 100 });
    expect((await http.post(`/v1/dealer/commissions/${c.commissionId}/paid`).set(as(manager)).send({ note: 'MTN 12345' }).expect(409)).body.code).toBe('commission_state');
    await http.post(`/v1/dealer/commissions/${c.commissionId}/approve`).set(as(manager)).send({}).expect(200);
    const paid = (await http.post(`/v1/dealer/commissions/${c.commissionId}/paid`).set(as(manager)).send({ note: 'MTN mobile money 12345' }).expect(200)).body;
    expect(paid).toMatchObject({ status: 'paid', paidReference: 'MTN mobile money 12345' });
    await http.post(`/v1/dealer/commissions/${c.commissionId}/cancel`).set(as(manager)).send({ note: 'changed my mind' }).expect(409);
    const statement = (await http.get('/v1/broker/commissions').set(bearer(broker1)).expect(200)).body;
    expect(statement.totals).toEqual({ waiting: 0, approved: 0, paid: 500_000 });
    expect(statement.items[0]).toMatchObject({ status: 'paid', amountUgx: 500_000, dealer: 'Kyambogo Bond', car: expect.stringContaining('Voxy') });
    expect((await http.get('/v1/broker/commissions').set(bearer(broker2)).expect(200)).body.items).toHaveLength(1); // Grace's cancelled one
    const events = await db.query(`SELECT to_status FROM dealer.commission_events WHERE commission_id = $1 ORDER BY at`, [c.commissionId]);
    expect(events.rows.map((r) => r.to_status)).toEqual(['pending', 'approved', 'paid']);
    // The broker's link stops once the car is sold; another dealer cannot touch these commissions.
    await http.get(`/v1/cars/${b1Token}`).expect(410);
    const other = await signIn('+256772800099', 'Other Dealer');
    const otherOrg = (await http.post('/v1/organisations').set(bearer(other)).send({ type: 'dealer', legalName: 'Other Ltd' }).expect(201)).body.id;
    await http.post(`/v1/admin/organisations/${otherOrg}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Yard visited' }).expect(200);
    await http.post(`/v1/dealer/commissions/${c.commissionId}/cancel`).set(as(other, otherOrg)).send({ note: 'x' }).expect(404);
  });

  it('a broker’s own links can be listed and stopped only by that broker', async () => {
    const links = (await http.get('/v1/broker/links').set(bearer(broker2)).expect(200)).body.items;
    expect(links.length).toBeGreaterThanOrEqual(2);
    await http.delete(`/v1/broker/links/${links[0].linkId}`).set(bearer(broker1)).expect(404);
    await http.delete(`/v1/broker/links/${links[0].linkId}`).set(bearer(broker2)).expect(204);
    await http.delete(`/v1/dealer/links/${links[1].linkId}`).set(as(manager)).expect(404); // a dealer cannot stop a broker's link
  });
  it('two brokers who both brought a customer can share the commission, as the dealer decides', async () => {
    const add = async (chassis: string) => (await http.post('/v1/dealer/stock').set(as(manager)).send({ chassisNumber: chassis, askingPriceUgx: 60_000_000,
      details: { make: 'Toyota', model: 'Harrier', commissionKind: 'fixed', commissionFixedUgx: 600_000 } }).expect(201)).body.stockId as string;
    const carA = await add('ZSU60-0777111');
    const carB = await add('ZSU60-0777222');
    const la = (await http.post(`/v1/broker/cars/${carA}/links`).set(bearer(broker1)).send({ channel: 'whatsapp' }).expect(201)).body;
    const lb = (await http.post(`/v1/broker/cars/${carB}/links`).set(bearer(broker2)).send({ channel: 'whatsapp' }).expect(201)).body;
    await http.post(`/v1/cars/${la.token}/enquiries`).send({ name: 'Zed Okot', phone: '+256703333444', consent: true }).expect(201);
    await http.post(`/v1/cars/${lb.token}/enquiries`).send({ name: 'Zed Okot', phone: '+256703333444', consent: true }).expect(201);
    const zed = (await http.get('/v1/dealer/leads?stage=open').set(as(manager)).expect(200)).body.items.find((l: { customer: { name: string }; needsDecision: boolean }) => l.customer.name === 'Zed Okot' && l.needsDecision);
    expect(zed).toMatchObject({ broker: 'Grace', earlier: { by: 'Ivan', broker: true } });
    // Grace's enquiry waits for the decision in her list too.
    expect((await http.get('/v1/broker/enquiries').set(bearer(broker2)).expect(200)).body.items.find((e: { customer: { name: string } }) => e.customer.name === 'Zed Okot').waitingForDealerDecision).toBe(true);
    const decided = (await http.post(`/v1/dealer/leads/${zed.leadId}/decision`).set(as(manager)).send({ outcome: 'split', splitPercent: 60, reason: 'Ivan found him, Grace closed the sale' }).expect(200)).body;
    expect(decided).toMatchObject({ broker: 'Grace', splitBroker: { name: 'Ivan', percent: 40 }, needsDecision: false });
    await http.patch(`/v1/dealer/leads/${zed.leadId}`).set(as(staff)).send({ stage: 'completed', salePriceUgx: 59_000_000 }).expect(200);
    const comms = (await http.get('/v1/dealer/commissions').set(as(manager)).expect(200)).body.items.filter((c: { stockId: string }) => c.stockId === carB);
    expect(comms.map((c: { broker: string; sharePercent: number; amountUgx: number; status: string }) => [c.broker, c.sharePercent, c.amountUgx, c.status]).sort())
      .toEqual([['Grace', 60, 360_000, 'pending'], ['Ivan', 40, 240_000, 'pending']]);
  });
});
