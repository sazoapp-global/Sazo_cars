// I-07: a buyer books an inspection, the inspector accepts or declines, each side gets an SMS, and phones are
// shared only once the inspector accepts. Skipped when TEST_DATABASE_URL is not set.
import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { AuthService, IamService } from './modules/iam/index.js';
import { ConsoleSmsSender } from './modules/notify/index.js';

const url = process.env.TEST_DATABASE_URL;
const phone = () => `+25678${String(randomInt(1e7)).padStart(7, '0')}`;
const day = (n: number) => new Date(Date.now() + 3 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!url)('inspection bookings (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let sms: ConsoleSmsSender;
  const pool = new pg.Pool({ connectionString: url });
  const buyerPhone = phone();
  const managerPhone = phone();
  let orgId: string;
  let garageId: string;
  let asBuyer: Record<string, string> = {};
  let asOtherBuyer: Record<string, string> = {};
  let asInspector: Record<string, string> = {};
  let asGarage: Record<string, string> = {};

  beforeAll(async () => {
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url }));
    await app.init();
    http = request(app.getHttpServer());
    sms = app.get(ConsoleSmsSender, { strict: false });
    const iam = app.get(IamService);
    const auth = app.get(AuthService);
    const org = async (type: string, name: string) => (await pool.query<{ id: string }>(
      `INSERT INTO iam.organisations (type, legal_name, trading_name, district, status, approved_at) VALUES ($1, $2, $2, 'Kampala', 'approved', now()) RETURNING id`, [type, name])).rows[0]!.id;
    orgId = await org('inspection_centre', `Booking Test Centre ${randomInt(1e6)}`);
    garageId = await org('garage', `Booking Test Garage ${randomInt(1e6)}`);
    const manager = await iam.ensureUser(managerPhone, 'Okello Inspector');
    await iam.addMember(manager, orgId, 'org_manager');
    const garageManager = await iam.ensureUser(phone(), 'Garage Manager');
    await iam.addMember(garageManager, garageId, 'org_manager');
    const buyer = await iam.ensureUser(buyerPhone, 'Amina Buyer');
    const other = await iam.ensureUser(phone(), 'Other Buyer');
    const token = async (u: string) => ({ Authorization: `Bearer ${(await auth.issueTokens(u)).accessToken}` });
    asBuyer = await token(buyer);
    asOtherBuyer = await token(other);
    asInspector = { ...(await token(manager)), 'X-Organisation-Id': orgId };
    asGarage = { ...(await token(garageManager)), 'X-Organisation-Id': garageId };
  });

  afterAll(async () => {
    await pool.end();
    await app?.close();
  });

  it('lists approved inspectors and refuses a garage, a past day or an unknown inspector', async () => {
    const list = (await http.get('/v1/inspectors').set(asBuyer).expect(200)).body.items;
    expect(list).toContainEqual(expect.objectContaining({ organisationId: orgId, type: 'inspection_centre', district: 'Kampala' }));
    expect(list.map((o: { organisationId: string }) => o.organisationId)).not.toContain(garageId);
    await http.post('/v1/bookings').set(asBuyer).send({ organisationId: garageId, plate: 'UBA 123X', preferredDate: day(2) }).expect(404);
    await http.post('/v1/bookings').set(asBuyer).send({ organisationId: orgId, plate: 'UBA 123X', preferredDate: day(-1) }).expect(400);
    await http.post('/v1/bookings').set(asBuyer).send({ organisationId: orgId, plate: 'UBA 123X', preferredDate: day(90) }).expect(400);
    await http.post('/v1/bookings').set(asBuyer).send({ organisationId: orgId, plate: 'UBA 123X', preferredDate: day(2), vehicleRef: 'SZV-NONE-0000' }).expect(404);
  });

  it('runs a booking from request to accepted to done, with SMS and phones shared only after accepting', async () => {
    const made = await http.post('/v1/bookings').set(asBuyer)
      .send({ organisationId: orgId, plate: 'uba  123x', preferredDate: day(2), place: 'Ntinda car bond', note: 'Please check the gearbox' }).expect(201);
    expect(made.body).toMatchObject({ status: 'requested', plate: 'UBA 123X', inspector: { organisationId: orgId, phone: null } });
    expect(sms.latest(managerPhone)).toContain('UBA 123X');
    const id = made.body.bookingId;

    // Another buyer and a garage cannot see or answer it.
    expect((await http.get('/v1/me/bookings').set(asOtherBuyer).expect(200)).body.items).toEqual([]);
    await http.get('/v1/inspection-bookings').set(asGarage).expect(403);
    await http.post(`/v1/me/bookings/${id}/cancel`).set(asOtherBuyer).expect(404);

    const open = (await http.get('/v1/inspection-bookings').set(asInspector).expect(200)).body.items.find((b: { bookingId: string }) => b.bookingId === id);
    expect(open).toMatchObject({ status: 'requested', note: 'Please check the gearbox', buyer: { givenName: 'Amina', phone: null } });

    await http.post(`/v1/inspection-bookings/${id}/decision`).set(asInspector).send({ decision: 'accept' }).expect(400);
    await http.post(`/v1/inspection-bookings/${id}/decision`).set(asInspector).send({ decision: 'done' }).expect(409);
    const at = new Date(`${day(2)}T07:00:00Z`).toISOString();
    const accepted = await http.post(`/v1/inspection-bookings/${id}/decision`).set(asInspector).send({ decision: 'accept', scheduledAt: at }).expect(200);
    expect(accepted.body).toMatchObject({ status: 'accepted', scheduledAt: at, buyer: { phone: buyerPhone } });
    expect(sms.latest(buyerPhone)).toMatch(/will inspect car UBA 123X on .*10:00/);
    const mine = (await http.get('/v1/me/bookings').set(asBuyer).expect(200)).body.items[0];
    expect(mine).toMatchObject({ bookingId: id, status: 'accepted', inspector: { phone: managerPhone } });

    const done = await http.post(`/v1/inspection-bookings/${id}/decision`).set(asInspector).send({ decision: 'done' }).expect(200);
    expect(done.body).toMatchObject({ status: 'done', buyer: { phone: null } });
    await http.post(`/v1/me/bookings/${id}/cancel`).set(asBuyer).expect(409);
  });

  it('declines with a reason, and the buyer can cancel an open request', async () => {
    const a = (await http.post('/v1/bookings').set(asBuyer).send({ organisationId: orgId, plate: 'UBB 456Y', preferredDate: day(3) }).expect(201)).body.bookingId;
    await http.post(`/v1/inspection-bookings/${a}/decision`).set(asInspector).send({ decision: 'decline' }).expect(400);
    const declined = await http.post(`/v1/inspection-bookings/${a}/decision`).set(asInspector).send({ decision: 'decline', note: 'Fully booked that week' }).expect(200);
    expect(declined.body).toMatchObject({ status: 'declined', responseNote: 'Fully booked that week' });
    expect(sms.latest(buyerPhone)).toContain('Fully booked that week');

    const b = (await http.post('/v1/bookings').set(asBuyer).send({ organisationId: orgId, plate: 'UBC 789Z', preferredDate: day(4) }).expect(201)).body.bookingId;
    const cancelled = await http.post(`/v1/me/bookings/${b}/cancel`).set(asBuyer).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    await http.post(`/v1/inspection-bookings/${b}/decision`).set(asInspector).send({ decision: 'accept', scheduledAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(409);
  });

  it('limits a buyer to five requests a day', async () => {
    for (let i = 0; i < 2; i++) await http.post('/v1/bookings').set(asBuyer).send({ organisationId: orgId, plate: `UBD 10${i}A`, preferredDate: day(5) }).expect(201);
    const res = await http.post('/v1/bookings').set(asBuyer).send({ organisationId: orgId, plate: 'UBD 999A', preferredDate: day(5) });
    expect(res.status).toBe(429);
  });
});
