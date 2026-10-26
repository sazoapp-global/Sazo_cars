// Dealer dashboard and payments (D-122, D-123, D-146): cash in full or a deposit and monthly instalments; payments
// with receipt numbers and SMS receipts; corrections instead of edits; late payments; reminders sent once each;
// the car's report shows only whether a dealer is still owed; the dashboard shows money to managers only.
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
import { PaymentsService, addMonths, allocate, kampalaToday, monthlyAmounts } from './modules/dealer/payments.service.js';
import { AuthService, IamService } from './modules/iam/index.js';
import { ConsoleSmsSender } from './modules/notify/index.js';
import { approveOrg, signInWithCode } from './test-auth.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('payment plan arithmetic', () => {
  it('splits the balance into whole thousands, the last month taking the rest', () => {
    expect(monthlyAmounts(30_000_000, 12)).toEqual(Array(12).fill(2_500_000));
    const odd = monthlyAmounts(28_000_000, 12);
    expect(odd.slice(0, 11)).toEqual(Array(11).fill(2_333_000));
    expect(odd[11]).toBe(2_337_000);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(28_000_000);
  });
  it('keeps the day of the month, or the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
  it('puts money on the oldest payment first and marks late, part paid, due soon and coming', () => {
    const rows = allocate([
      { seq: 0, dueOn: '2026-06-02', amountUgx: 10 }, { seq: 1, dueOn: '2026-07-02', amountUgx: 5 },
      { seq: 2, dueOn: '2026-07-20', amountUgx: 5 }, { seq: 3, dueOn: '2026-09-01', amountUgx: 5 },
    ], 13, '2026-07-15');
    expect(rows.map((r) => [r.status, r.paidUgx])).toEqual([['paid', 10], ['late', 3], ['due_soon', 0], ['coming', 0]]);
    expect(rows[1]!.daysLate).toBe(13);
  });
});

describe.skipIf(!base)('dealer dashboard and payments (e2e)', () => {
  const dbName = `sazo_dpay_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  const cars: Record<string, string> = {};
  const today = kampalaToday();

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const as = (t: string) => ({ ...bearer(t), 'X-Organisation-Id': orgId });
  const sms = () => app.get(ConsoleSmsSender, { strict: false });

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString(), EVIDENCE_DIR: evidenceDir }));
    await app.init();
    http = request(app.getHttpServer());
    const adminId = await app.get(IamService).ensureUser('+256700000981', 'Test Admin', 'sazo_admin');
    const adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    manager = await signInWithCode(app, http, '+256772810001', 'Joseph Manager');
    orgId = (await http.post('/v1/organisations').set(bearer(manager)).send({ type: 'dealer', legalName: 'Kisementi Motors Ltd', tradingName: 'Kisementi Motors' }).expect(201)).body.id;
    await approveOrg(app, http, adminToken, orgId, 'Yard visited');
    await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772810002', displayName: 'Ruth Sales', role: 'org_staff' }).expect(201);
    staff = await signInWithCode(app, http, '+256772810002');
    for (const [k, chassis, model, price] of [['wish', 'ZGE20-0777001', 'Wish', 21_000_000], ['premio', 'NZT260-0777002', 'Premio', 41_000_000],
      ['forester', 'SJ5-0777003', 'Forester', 30_000_000], ['harrier', 'ZSU60-0777004', 'Harrier', 52_000_000]] as const) {
      cars[k] = (await http.post('/v1/dealer/stock').set(as(manager)).send({ chassisNumber: chassis, askingPriceUgx: price, details: { make: k === 'forester' ? 'Subaru' : 'Toyota', model } }).expect(201)).body.stockId;
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  it('a car sold for cash: paid in full at the sale, receipt R-0001 and an SMS receipt', async () => {
    const plan = { buyer: { name: 'moses tumusiime', phone: '+256772810101' }, kind: 'cash', paidAtSale: { method: 'cash' } };
    expect((await http.post(`/v1/dealer/stock/${cars.wish}/payment-plan`).set(as(manager)).send(plan).expect(409)).body.code).toBe('not_sold');
    await http.post(`/v1/dealer/stock/${cars.wish}/sold`).set(as(manager)).send({ salePriceUgx: 21_000_000, soldOn: today }).expect(200);
    await http.post(`/v1/dealer/stock/${cars.wish}/payment-plan`).set(as(staff)).send(plan).expect(403); // money is for managers
    const d = (await http.post(`/v1/dealer/stock/${cars.wish}/payment-plan`).set(as(manager)).send(plan).expect(201)).body;
    expect(d).toMatchObject({ kind: 'cash', priceUgx: 21_000_000, paidUgx: 21_000_000, balanceUgx: 0, state: 'paid', buyer: { name: 'Moses Tumusiime', phone: '+256772810101' } });
    expect(d.payments).toHaveLength(1);
    expect(d.payments[0]).toMatchObject({ receiptNo: 'R-0001', method: 'cash', amountUgx: 21_000_000, paidOn: today });
    expect(sms().latest('+256772810101')).toBe('SAZO receipt R-0001: Kisementi Motors received UGX 21,000,000 for Toyota Wish. Balance UGX 0. Thank you.');
    expect((await http.post(`/v1/dealer/stock/${cars.wish}/payment-plan`).set(as(manager)).send(plan).expect(409)).body.code).toBe('plan_exists');
    expect((await http.post(`/v1/dealer/payments/${d.planId}/payments`).set(as(manager)).send({ amountUgx: 1000, method: 'cash', paidOn: today }).expect(409)).body.code).toBe('fully_paid');
  });

  let premio: string;
  it('instalments: a deposit and 12 monthly payments; payments, receipts, a correction', async () => {
    const soldOn = addDays(today, -95);
    await http.post(`/v1/dealer/stock/${cars.premio}/sold`).set(as(manager)).send({ salePriceUgx: 40_000_000, soldOn }).expect(200);
    const bad = { buyer: { name: 'Sarah Kemigisha', phone: '+256772810102' }, kind: 'instalments', depositUgx: 10_000_000, months: 12, firstDueOn: addDays(soldOn, 30), amounts: [1_000_000] };
    expect((await http.post(`/v1/dealer/stock/${cars.premio}/payment-plan`).set(as(manager)).send(bad).expect(400)).body.detail).toBe('Give 12 monthly amounts, each more than 0');
    const { amounts: _a, ...good } = bad;
    const d = (await http.post(`/v1/dealer/stock/${cars.premio}/payment-plan`).set(as(manager)).send({ ...good, paidAtSale: { method: 'mtn_momo', reference: 'MP-5821' } }).expect(201)).body;
    premio = d.planId;
    expect(d.schedule).toHaveLength(13);
    expect(d.schedule[0]).toMatchObject({ seq: 0, dueOn: soldOn, amountUgx: 10_000_000, status: 'paid' });
    expect(d.schedule.slice(1).every((s: { amountUgx: number }) => s.amountUgx === 2_500_000)).toBe(true);
    expect(d.schedule[1].dueOn).toBe(addDays(soldOn, 30));
    expect(d.schedule[2].dueOn).toBe(addMonths(addDays(soldOn, 30), 1));
    // Three monthly payments are due by now and none is paid: late.
    expect(d).toMatchObject({ paidUgx: 10_000_000, balanceUgx: 30_000_000, state: 'late', lateUgx: 7_500_000 });
    expect(d.schedule[1].status).toBe('late');

    expect((await http.post(`/v1/dealer/payments/${premio}/payments`).set(as(manager)).send({ amountUgx: 31_000_000, method: 'cash', paidOn: today }).expect(400)).body.detail).toBe('That is more than the UGX 30,000,000 still owed');
    expect((await http.post(`/v1/dealer/payments/${premio}/payments`).set(as(manager)).send({ amountUgx: 1_000, method: 'cash', paidOn: addDays(soldOn, -1) }).expect(400)).body.code).toBe('plan_invalid');
    const p1 = (await http.post(`/v1/dealer/payments/${premio}/payments`).set(as(manager)).send({ amountUgx: 5_000_000, method: 'bank', paidOn: today, reference: 'Stanbic 7781' }).expect(201)).body;
    expect(p1.receiptNo).toBe('R-0003');
    expect(sms().latest('+256772810102')).toBe('SAZO receipt R-0003: Kisementi Motors received UGX 5,000,000 for Toyota Premio. Balance UGX 25,000,000. Thank you.');
    let now = (await http.get(`/v1/dealer/payments/${premio}`).set(as(manager)).expect(200)).body;
    expect(now.schedule.slice(1, 4).map((s: { status: string }) => s.status)).toEqual(['paid', 'paid', 'late']);
    expect(now).toMatchObject({ balanceUgx: 25_000_000, lateUgx: 2_500_000 });

    // A mistake is corrected, never edited: both stay on record.
    const fix = (await http.post(`/v1/dealer/payments/${premio}/payments/${p1.paymentId}/correct`).set(as(manager)).send({ reason: 'bank transfer bounced' }).expect(201)).body;
    expect(fix.receiptNo).toBe('R-0004');
    await http.post(`/v1/dealer/payments/${premio}/payments/${p1.paymentId}/correct`).set(as(manager)).send({ reason: 'again' }).expect(409);
    now = (await http.get(`/v1/dealer/payments/${premio}`).set(as(manager)).expect(200)).body;
    expect(now.balanceUgx).toBe(30_000_000);
    expect(now.payments.map((p: { amountUgx: number; corrected: boolean; method: string }) => [p.method, p.amountUgx, p.corrected])).toEqual([
      ['correction', -5_000_000, false], ['bank', 5_000_000, true], ['mtn_momo', 10_000_000, false]]);
    expect(now.payments[0].note).toBe('Corrects R-0003: Bank transfer bounced');
    await expect(db.query(`UPDATE dealer.payments SET amount_ugx = 1 WHERE id = $1`, [p1.paymentId])).rejects.toThrow();
    const receipt = (await http.get(`/v1/dealer/payments/${premio}/receipts/${p1.paymentId}`).set(as(manager)).expect(200)).body;
    expect(receipt).toMatchObject({ receiptNo: 'R-0003', amountUgx: 5_000_000, method: 'bank', reference: 'Stanbic 7781', dealer: { name: 'Kisementi Motors' }, buyer: { name: 'Sarah Kemigisha' }, balanceAfterUgx: 25_000_000 });
  });

  it("the car's report says only that a dealer is still owed (D-123)", async () => {
    const ref = (await http.get(`/v1/dealer/stock/${cars.premio}`).set(as(manager)).expect(200)).body.vehicleRef;
    const summary = (await http.get(`/v1/vehicles/${ref}/summary`).expect(200)).body;
    expect(summary.statuses).toEqual({ dealerBalance: 'owed' });
    expect(JSON.stringify(summary)).not.toMatch(/Kemigisha|30000000|30,000,000/);
    const other = (await http.get(`/v1/dealer/stock/${cars.harrier}`).set(as(manager)).expect(200)).body.vehicleRef;
    expect((await http.get(`/v1/vehicles/${other}/summary`).expect(200)).body.statuses).toEqual({ dealerBalance: null });
  });

  it('reminders: the buyer and the managers are texted once when a payment is late', async () => {
    const service = app.get(PaymentsService, { strict: false });
    const at10 = new Date(`${today}T07:00:00Z`); // 10:00 in Kampala
    expect(await service.sendReminders(new Date(`${today}T19:00:00Z`))).toBe(0); // 22:00: nobody is texted at night
    const sent = await service.sendReminders(at10);
    expect(sent).toBeGreaterThanOrEqual(2);
    expect(sms().latest('+256772810102')).toMatch(/^Kisementi Motors: your payment of UGX 2,500,000 for Toyota Premio was due on .* and is not yet recorded\. Please pay or call Kisementi Motors\.$/);
    expect(sms().latest('+256772810001')).toMatch(/^SAZO: Sarah Kemigisha has not paid UGX 2,500,000 for Toyota Premio, due on .*\. See Payments in your dealer console\.$/);
    expect(await service.sendReminders(at10)).toBe(0); // each one once
  });

  it('the dashboard: money for managers, counts for sales staff; the payments list and its cards', async () => {
    await http.post(`/v1/dealer/stock/${cars.forester}/sold`).set(as(manager)).send({ salePriceUgx: 29_500_000, soldOn: today }).expect(200);
    const m = (await http.get('/v1/dealer/dashboard').set(as(manager)).expect(200)).body;
    expect(m.monthly).toHaveLength(12);
    expect(m.monthly[11]).toEqual({ month: today.slice(0, 7), cars: 2, valueUgx: 50_500_000 });
    expect(m).toMatchObject({ manager: true, stock: { count: 1 }, soldThisMonth: { cars: 2, valueUgx: 50_500_000 }, payments: { owedUgx: 30_000_000, owingSales: 1, lateBuyers: 1 } });
    expect(m.payments.dueSoon[0]).toMatchObject({ planId: premio, state: 'late', car: { name: 'Toyota Premio' }, buyer: { name: 'Sarah Kemigisha' } });
    const s = (await http.get('/v1/dealer/dashboard').set(as(staff)).expect(200)).body;
    expect(s).toMatchObject({ manager: false, soldThisMonth: { cars: 2 } });
    expect(JSON.stringify(s)).not.toMatch(/valueUgx|owedUgx|payments|commissions|50500000/);
    await http.get('/v1/dealer/payments').set(as(staff)).expect(403);

    const list = (await http.get('/v1/dealer/payments?show=all').set(as(manager)).expect(200)).body;
    expect(list.summary).toMatchObject({ owedUgx: 30_000_000, owingSales: 1, lateBuyers: 1, receivedThisMonthCount: 2 });
    expect(list.items.map((i: { car: { name: string }; state: string }) => [i.car.name, i.state])).toEqual([['Toyota Wish', 'paid'], ['Toyota Premio', 'late']]);
    expect(list.unplanned.map((u: { car: { name: string } }) => u.car.name)).toEqual(['Subaru Forester']);
    expect((await http.get('/v1/dealer/payments?show=late').set(as(manager)).expect(200)).body.items).toHaveLength(1);
  });
});
