// npm run seed:demo -w @sazo/api — fill a DEVELOPMENT database with simulated people, businesses and their work, so
// every list in SAZO has something to show (25 Oct 2026). Everything goes through the real API routes, so the
// same rules apply as for real use (approvals, photo checks, private costs). The scenario cars are loaded first
// if they are missing. Refuses to run in production, and runs once per database.
//
// All names, phone numbers, emails, plates and figures are made up. Every account can log in with its phone
// (code in the API window) or its email and the password printed at the end.
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PersonDetails } from '@sazo/contracts';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import type pg from 'pg';
import { AuthService, IamService } from '../modules/iam/index.js';
import { PII_KEYRING, type Keyring } from '../platform/keyring.js';
import { DB_POOL } from '../platform/tokens.js';
import { ConsoleEmailSender } from '../modules/notify/index.js';
import { signInWithCode } from '../test-auth.js';
import { testPhoto } from '../test-photos.js';
import { DEMO_SALES } from './demo-payments.js';
import { VIEWS, bodyOf, demoCarPhoto } from './demo-photos.js';
import { seedScenarios } from './scenario-seed.js';

/** A demo picture of a car (see demo-photos.ts): angle by position, so a car's photos read like a listing. */
const carPhoto = (seed: string, colour: string, model = '', i = 0) => demoCarPhoto(seed, colour, bodyOf(model), VIEWS[i % VIEWS.length]!);

const PASSWORD = 'sazo-demo-2026';
/** Demo SAZO staff share one authenticator key (D-145): add it to an authenticator app by hand to log in as them. */
const DEMO_AUTHENTICATOR_KEY = 'SAZODEMOSAZODEMOSAZODEMOSAZODEMO';
const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('Refusing to load demo data into production');

const app: INestApplication = await createApp(loadConfig({ ...process.env, NODE_ENV: 'development' }));
await app.listen(0, '127.0.0.1'); // already listening, so requests can overlap safely
const http = request(app.getHttpServer());
const iam = app.get(IamService, { strict: false });
const log = (m: string) => console.log(m);

// ---------------------------------------------------------------------------------------------- helpers

type Token = string;
const bearer = (t: Token) => ({ Authorization: `Bearer ${t}` });
const asOrg = (t: Token, org: string) => ({ ...bearer(t), 'X-Organisation-Id': org });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Fail loudly with the API's own words, so a broken step is easy to see. */
async function call(req: request.Test, expect: number | number[] = [200, 201, 202, 204]): Promise<request.Response> {
  const { method, url } = req as unknown as { method: string; url: string };
  const res = await req;
  const ok = Array.isArray(expect) ? expect.includes(res.status) : res.status === expect;
  if (!ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

async function upload(t: Token, kind: string, bytes: Buffer): Promise<string> {
  const slot = await call(http.post('/v1/evidence/uploads').set(bearer(t))
    .send({ kind, mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
  await call(http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(t)).set('Content-Type', 'image/jpeg').send(bytes));
  return (await call(http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(t)))).body.evidenceId;
}

interface Person { phone: string; name: string; email: string; token: Token }
const people: { who: string; p: Person }[] = [];

/** Sign up with a phone code, then add a confirmed email and the demo password (a full profile, D-102). */
async function person(who: string, phone: string, name: string, existing = false): Promise<Person> {
  const token = await signInWithCode(app, http, phone, existing ? undefined : name);
  if (existing) { // added by a manager: finish the details at first log-in, as staff do (D-101)
    const [firstName, ...rest] = name.split(' ');
    await call(http.put('/v1/me/details').set(bearer(token)).send({ surname: rest.join(' '), firstName, gender: 'male', dateOfBirth: '1992-08-20' }), [200, 204, 409]);
  }
  const [first, ...rest] = name.toLowerCase().split(' ');
  const email = `${first}.${rest.join('')}@demo.sazo.test`;
  await call(http.post('/v1/me/email').set(bearer(token)).send({ email }));
  const text = app.get(ConsoleEmailSender, { strict: false }).latest(email)!.text;
  await call(http.post('/v1/auth/email/verify').send({ token: text.match(/token=([A-Za-z0-9_-]+)/)![1] }));
  await call(http.put('/v1/me/password').set(bearer(token)).send({ newPassword: PASSWORD }));
  const p = { phone, name, email, token };
  people.push({ who, p });
  return p;
}

/** SAZO staff are made by a server command (D-109), then given the same full profile. */
async function staff(who: string, phone: string, name: string, role: 'sazo_admin' | 'sazo_reviewer'): Promise<Person> {
  const id = await iam.ensureUser(phone, name, role);
  const [firstName, ...rest] = name.split(' ');
  const details = PersonDetails.parse({ surname: rest.join(' '), firstName, gender: 'female', dateOfBirth: '1986-04-12' });
  await app.get(AuthService, { strict: false }).completeDetails(id, details);
  const p = await person(who, phone, name, true); // sets up an authenticator app on the way in
  const keyring = app.get<Keyring>(PII_KEYRING, { strict: false });
  await app.get<pg.Pool>(DB_POOL, { strict: false }).query(
    `UPDATE iam.authenticators SET secret_ciphertext = $2, key_version = $3, last_step = NULL WHERE user_id = $1`,
    [id, keyring.encrypt(DEMO_AUTHENTICATOR_KEY), keyring.current]);
  return p;
}

async function business(t: Token, type: string, legalName: string, tradingName: string, district: string): Promise<string> {
  return (await call(http.post('/v1/organisations').set(bearer(t)).send({ type, legalName, tradingName, district, contactPhone: undefined }))).body.id;
}
const approve = (admin: Token, org: string, reason: string) =>
  call(http.post(`/v1/admin/organisations/${org}/decision`).set(bearer(admin)).send({ decision: 'approve', reason }));
const ref = async (plate: string) => (await call(http.get('/v1/vehicles/search').query({ q: plate }))).body.matches[0]?.vehicleRef as string | undefined;

/** Send a garage job or an inspection, explaining any warning the way a careful mechanic would. */
async function submit(path: string, headers: Record<string, string>) {
  const key = randomUUID();
  const first = await http.post(path).set(headers).set('Idempotency-Key', key).send({});
  if (first.status === 422 && first.body.code === 'warnings_need_acknowledgement') {
    const acknowledgedWarnings = first.body.errors.map((w: { code: string }) => ({ code: w.code, explanation: 'Checked with the customer and the car; photo attached' }));
    return call(http.post(path).set(headers).set('Idempotency-Key', key).send({ acknowledgedWarnings }));
  }
  if (first.status >= 300) throw new Error(`${path} → ${first.status} ${JSON.stringify(first.body)}`);
  return first;
}

// ---------------------------------------------------------------------------------------------- run once

if (await iam.userIdByPhone('+256700100001')) {
  log('Demo data is already loaded in this database. To start again, recreate the database, migrate it and run this again.');
  await app.close();
  process.exit(0);
}
if (!(await ref('UBJ 214K'))) {
  log('Loading the scenario cars first…');
  await seedScenarios(app, { log: () => undefined });
}

log('SAZO staff…');
const admin = await staff('SAZO admin', '+256700100001', 'Grace Nakato', 'sazo_admin');
await staff('SAZO reviewer', '+256700100002', 'Peter Okello', 'sazo_reviewer');

log('Announcements and help answers…');
for (const a of [
  { audience: 'everyone', title: 'Welcome to SAZO testing', body: 'Records you see are simulated while SAZO is in testing. Tell us what is confusing.' },
  { audience: 'dealers', title: 'Add many cars at once', body: 'Managers can add a whole shipment from an Excel file under Add many cars.' },
  { audience: 'garages', title: 'Odometer photos', body: 'Take the odometer photo in good light. Dark photos are flagged for a second look.' },
]) await call(http.post('/v1/admin/announcements').set(bearer(admin.token)).send(a));
for (const f of [
  { topic: 'About', question: 'Is checking a car free?', answer: 'Yes. Checking a car is free while SAZO is in testing.' },
  { topic: 'Records', question: 'Where do the records come from?', answer: 'From approved garages, inspectors, dealers and data partners. Each record shows its source.' },
  { topic: 'Dealers', question: 'Do buyers see my costs?', answer: 'No. Costs, margins and sale prices are private to your business.' },
]) await call(http.post('/v1/admin/faqs').set(bearer(admin.token)).send({ audience: 'everyone', status: 'published', ...f }));

// ---------------------------------------------------------------------------------------------- dealer

log('Dealer: Kisementi Motors, with cars, photos, costs, enquiries and sales…');
const dealerMgr = await person('Dealer manager', '+256700200001', 'Joseph Mukasa');
const dealer = await business(dealerMgr.token, 'dealer', 'Kisementi Motors Ltd', 'Kisementi Motors', 'Kampala');
await approve(admin.token, dealer, 'Yard visited at Kisementi; trading licence valid');
const D = (t: Token = dealerMgr.token) => asOrg(t, dealer);
await call(http.post('/v1/garage/staff').set(D()).send({ phone: '+256700200002', displayName: 'Ruth Namutebi', role: 'org_staff' }));
const dealerSales = await person('Dealer sales', '+256700200002', 'Ruth Namutebi', true);
await call(http.put('/v1/dealer/settings').set(D()).send({ stockAgeAlertDays: [60, 120, 180], leadProtectionDays: 30, whatsappE164: '+256700200001' }));

interface CarSpec {
  ids: Record<string, string>; price: number; make: string; model: string; year: number; colour: string; stage: string; yard?: string;
  received: number; photos: number; costs?: [string, number, string, number?][]; brokers?: 'fixed' | 'percent'; bond?: { arrived: number; deadline: number };
  sold?: number;
  /** D-148: the kind the dealer typed (left out, SAZO fills it in from the chassis code or model when it can). */
  kind?: string;
}
const cars: CarSpec[] = [
  { ids: { plate: 'UBJ 214K' }, price: 78_000_000, make: 'toyota', model: 'harrier', year: 2015, colour: 'pearl white', stage: 'at_yard', yard: 'Kisementi yard', received: -21, photos: 5,
    costs: [['purchase', 14_200, 'USD', 3_720], ['freight_insurance', 1_350, 'USD', 3_720], ['customs_taxes', 17_400_000, 'UGX'], ['clearing_agent', 850_000, 'UGX']], brokers: 'fixed' },
  { ids: { plate: 'UBK 482M' }, price: 38_500_000, make: 'toyota', model: 'premio', year: 2016, colour: 'silver', stage: 'at_yard', yard: 'Kisementi yard', received: -40, photos: 4,
    costs: [['purchase', 23_000_000, 'UGX'], ['inspection_repairs', 1_200_000, 'UGX']], brokers: 'percent' },
  { ids: { plate: 'UBC 718P' }, price: 24_000_000, make: 'toyota', model: 'fielder', year: 2012, colour: 'grey', stage: 'at_yard', yard: 'Kisementi yard', received: -95, photos: 3,
    costs: [['purchase', 19_500_000, 'UGX']] },
  { ids: { plate: 'UBQ 615H' }, price: 41_000_000, make: 'toyota', model: 'wish', year: 2014, colour: 'blue', stage: 'at_yard', yard: 'Kisementi yard', received: -12, photos: 4,
    costs: [['purchase', 9_800, 'USD', 3_720], ['transport', 400_000, 'UGX']], brokers: 'fixed' },
  { ids: { chassisNumber: 'ZRR80-0123456' }, price: 52_000_000, make: 'toyota', model: 'voxy', year: 2016, colour: 'black', stage: 'in_bond', yard: 'Nakawa bond', received: -6, photos: 3,
    costs: [['purchase', 12_600, 'USD', 3_715], ['freight_insurance', 1_400, 'USD', 3_715]], bond: { arrived: -6, deadline: 9 } },
  { ids: { plate: 'UBR 228T' }, price: 47_000_000, make: 'nissan', model: 'x-trail', year: 2015, colour: 'red', stage: 'in_bond', yard: 'Nakawa bond', received: -30, photos: 3,
    costs: [['purchase', 11_000, 'USD', 3_700]], bond: { arrived: -30, deadline: 3 }, brokers: 'percent' },
  // The same plate is on two cars in SAZO (a cloned plate): a reviewer must decide which one this is (vehicle match).
  { ids: { plate: 'UAX 123A', chassisNumber: 'NZE141-0998877' }, price: 26_500_000, make: 'toyota', model: 'axio', year: 2011, colour: 'silver', stage: 'at_yard', yard: 'Kisementi yard', received: -8, photos: 2,
    costs: [['purchase', 21_000_000, 'UGX']] },
  { ids: {}, price: 29_000_000, make: 'honda', model: 'fit', year: 2015, colour: 'orange', stage: 'shipping', received: -2, photos: 2, costs: [['purchase', 6_900, 'USD', 3_720]] },
  { ids: { plate: 'UBP 904K' }, price: 33_000_000, make: 'subaru', model: 'forester', year: 2013, colour: 'green', stage: 'at_yard', yard: 'Kisementi yard', received: -60, photos: 3,
    costs: [['purchase', 26_000_000, 'UGX']], sold: 31_500_000 },
  { ids: { plate: 'UBN 330F' }, price: 44_000_000, make: 'toyota', model: 'noah', year: 2015, colour: 'white', stage: 'at_yard', yard: 'Kisementi yard', received: -25, photos: 4,
    costs: [['purchase', 35_000_000, 'UGX']], brokers: 'fixed' },
  // D-148: a Land Cruiser comes as an SUV or a pickup and has no chassis number here, so a SAZO admin sets the kind.
  { ids: { plate: 'UBH 551C' }, price: 96_000_000, make: 'toyota', model: 'land cruiser', year: 2014, colour: 'white', stage: 'at_yard', yard: 'Kisementi yard', received: -15, photos: 2,
    costs: [['purchase', 81_000_000, 'UGX']] },
  // D-148: the dealer typed SUV for a Hilux; the inspector later records a pickup, so the records disagree.
  { ids: { plate: 'UBF 300T' }, price: 72_000_000, make: 'toyota', model: 'hilux', year: 2016, colour: 'silver', stage: 'at_yard', yard: 'Kisementi yard', received: -18, photos: 2,
    costs: [['purchase', 60_000_000, 'UGX']], kind: 'suv' },
];
const COLOURS: Record<string, string> = { 'pearl white': '#f8fafc', silver: '#cbd5e1', grey: '#6b7280', blue: '#1d4ed8', black: '#111827', red: '#b91c1c', orange: '#ea580c', green: '#15803d', white: '#f1f5f9' };
const stock: Record<string, string> = {};
for (const c of cars) {
  const details = { make: c.make, model: c.model, modelYear: c.year, colour: c.colour, stage: c.stage, ...(c.kind ? { kind: c.kind } : {}), ...(c.yard ? { yard: c.yard } : {}), receivedOn: day(c.received),
    ...(c.bond ? { bondArrivedOn: day(c.bond.arrived), customsStatus: 'in_bond', customsDeadline: day(c.bond.deadline) } : {}),
    ...(c.brokers === 'fixed' ? { openToBrokers: true, commissionKind: 'fixed', commissionFixedUgx: 500_000 } : c.brokers === 'percent' ? { openToBrokers: true, commissionKind: 'percent', commissionPercent: 1.5 } : { openToBrokers: false }) };
  const added = (await call(http.post('/v1/dealer/stock').set(D()).send({ ...c.ids, askingPriceUgx: c.price, details }))).body;
  stock[`${c.make} ${c.model}`] = added.stockId;
  for (let i = 0; i < c.photos; i++) {
    const photo = await upload(dealerSales.token, 'vehicle_photo', await carPhoto(`${c.model} ${c.year} ${i}`, COLOURS[c.colour] ?? '#64748b', c.model, i));
    await call(http.post(`/v1/dealer/stock/${added.stockId}/photos`).set(D(dealerSales.token)).send({ evidenceId: photo }));
  }
  for (const [category, amount, currency, rateToUgx] of c.costs ?? []) {
    await call(http.post(`/v1/dealer/stock/${added.stockId}/costs`).set(D()).send({ category, amount, currency, ...(rateToUgx ? { rateToUgx } : {}) }));
  }
  // Ruth (sales) records this sale herself, so her dashboard counts it.
  if (c.sold) await call(http.post(`/v1/dealer/stock/${added.stockId}/sold`).set(D(dealerSales.token)).send({ salePriceUgx: c.sold, soldOn: day(-3) }));
}

log('Enquiries…');
const leads: [string, string, string, string, string?][] = [
  ['toyota harrier', 'Sarah Nambi', '+256752000111', 'walk_in', 'viewing'],
  ['toyota premio', 'Allan Ssempa', '+256752000222', 'whatsapp', 'negotiation'],
  ['toyota wish', 'Diana Achan', '+256752000333', 'phone_call'],
  ['nissan x-trail', 'Brian Tumusiime', '+256752000444', 'facebook', 'deposit'],
];
for (const [car, name, phone, source, stage] of leads) {
  const lead = (await call(http.post('/v1/dealer/leads').set(D(dealerSales.token)).send({ stockId: stock[car], name, phone, source, consent: true, message: 'Is the price negotiable?' }))).body;
  if (stage) await call(http.patch(`/v1/dealer/leads/${lead.leadId}`).set(D(dealerSales.token)).send({ stage }));
}
await call(http.post(`/v1/dealer/stock/${stock['toyota premio']}/links`).set(D(dealerSales.token)).send({ channel: 'whatsapp' }));

log('Brokers: one approved with a sale and a commission, one waiting…');
const broker = await person('Broker (approved)', '+256700300001', 'Ivan Kato');
await call(http.post('/v1/broker/application').set(bearer(broker.token)).send({ nin: 'CM86001234KATO', idPhotoEvidenceId: await upload(broker.token, 'official_document', await testPhoto('ivan kato id')) }));
const apps = (await call(http.get('/v1/admin/brokers/applications').set(bearer(admin.token)))).body.items;
await call(http.post(`/v1/admin/brokers/applications/${apps[0].applicationId}/decision`).set(bearer(admin.token)).send({ decision: 'approve', reason: 'ID photo matches the number' }));
const bl = (await call(http.post(`/v1/broker/cars/${stock['toyota noah']}/links`).set(bearer(broker.token)).send({ channel: 'tiktok' }))).body;
await call(http.post(`/v1/cars/${bl.token}/enquiries`).send({ name: 'Moses Wanyama', phone: '+256752000555', consent: true, message: 'Saw it on TikTok' }));
const noahLead = (await call(http.get('/v1/dealer/leads?stage=open').set(D()))).body.items.find((l: { customer: { name: string } }) => l.customer.name === 'Moses Wanyama');
await call(http.patch(`/v1/dealer/leads/${noahLead.leadId}`).set(D()).send({ stage: 'completed', salePriceUgx: 43_000_000 }));
const waitingBroker = await person('Broker (waiting)', '+256700300002', 'Grace Atim');
await call(http.post('/v1/broker/application').set(bearer(waitingBroker.token)).send({ nin: 'CF90004321ATIM', idPhotoEvidenceId: await upload(waitingBroker.token, 'official_document', await testPhoto('grace atim id')) }));

log('Past sales and payments: cash and instalments over the last 12 months…');
// D-146: the dashboard's monthly graph and the Payments pages. See demo-payments.ts for the sample sales.
const planOf = async (stockId: string, body: object) => (await call(http.post(`/v1/dealer/stock/${stockId}/payment-plan`).set(D()).send(body))).body as {
  planId: string; schedule: { seq: number; dueOn: string; amountUgx: number; owingUgx: number }[];
};
const methods = ['mtn_momo', 'cash', 'bank', 'airtel_money'] as const;
for (const [k, s] of DEMO_SALES.entries()) {
  const added = (await call(http.post('/v1/dealer/stock').set(D()).send({ plate: s.plate, chassisNumber: s.chassis, askingPriceUgx: s.asking,
    details: { make: s.make, model: s.model, modelYear: s.year, colour: s.colour, stage: 'at_yard', yard: 'Kisementi yard', receivedOn: day(-s.soldDaysAgo - 35), openToBrokers: false } }))).body;
  const photo = await upload(dealerSales.token, 'vehicle_photo', await carPhoto(`${s.model} ${s.year} sold`, COLOURS[s.colour] ?? '#64748b', s.model, 0));
  await call(http.post(`/v1/dealer/stock/${added.stockId}/photos`).set(D(dealerSales.token)).send({ evidenceId: photo }));
  // Every third sale was recorded by Ruth (sales); the manager records how each buyer pays.
  await call(http.post(`/v1/dealer/stock/${added.stockId}/sold`).set(D(k % 3 === 0 ? dealerSales.token : dealerMgr.token)).send({ salePriceUgx: s.price, soldOn: day(-s.soldDaysAgo) }));
  const p = s.plan;
  if (p.kind === 'cash') {
    await planOf(added.stockId, { buyer: s.buyer, kind: 'cash', paidAtSale: { method: p.method, reference: p.method === 'bank' ? `Stanbic ${s.chassis.slice(-4)}` : undefined } });
    continue;
  }
  const plan = await planOf(added.stockId, { buyer: s.buyer, kind: 'instalments', depositUgx: p.deposit, months: p.months, firstDueOn: day(-s.soldDaysAgo + p.firstDueAfterDays),
    reminders: p.reminders ?? true, paidAtSale: { method: p.depositMethod } });
  const monthly = plan.schedule.filter((x) => x.seq > 0);
  for (const [k, due] of monthly.slice(0, p.paid).entries()) {
    await call(http.post(`/v1/dealer/payments/${plan.planId}/payments`).set(D()).send({ amountUgx: due.amountUgx, method: methods[k % methods.length], paidOn: due.dueOn }));
  }
  const nextDue = monthly[p.paid];
  if (p.part && nextDue) {
    const on = new Date(Date.parse(`${nextDue.dueOn}T00:00:00Z`) + p.part.daysAfterDue * 86_400_000).toISOString().slice(0, 10);
    await call(http.post(`/v1/dealer/payments/${plan.planId}/payments`).set(D()).send({ amountUgx: p.part.amount, method: p.part.method, paidOn: on, reference: 'MoMo 58213904' }));
  }
}
// The Noah sold through the broker today: a deposit and 10 months, from the enquiry.
await planOf(stock['toyota noah']!, { buyer: { leadId: noahLead.leadId }, kind: 'instalments', depositUgx: 13_000_000, months: 10, firstDueOn: day(30), paidAtSale: { method: 'mtn_momo', reference: 'MP-77120' } });
// The Forester sold three days ago: cash, paid at the sale.
await planOf(stock['subaru forester']!, { buyer: { name: 'Allan Mubiru', phone: '+256752100116' }, kind: 'cash', paidAtSale: { method: 'cash' } });

log('A dealer waiting for approval, with cars kept private…');
const newDealer = await person('Dealer waiting for approval', '+256700200003', 'Brian Ssali');
const bwe = await business(newDealer.token, 'dealer', 'Bweyogerere Autos Ltd', 'Bweyogerere Autos', 'Wakiso');
for (const [ids, make, model, price] of [[{ plate: 'UBT 112C' }, 'mazda', 'demio', 21_000_000], [{ chassisNumber: 'NHP10-0456789' }, 'toyota', 'aqua', 34_000_000]] as const) {
  const added = (await call(http.post('/v1/dealer/stock').set(asOrg(newDealer.token, bwe)).send({ ...ids, askingPriceUgx: price, details: { make, model, stage: 'at_yard' } }))).body;
  await call(http.post(`/v1/dealer/stock/${added.stockId}/photos`).set(asOrg(newDealer.token, bwe)).send({ evidenceId: await upload(newDealer.token, 'vehicle_photo', await carPhoto(`${model} bwe`, '#0f766e', model)) }));
}
await call(http.post('/v1/me/identity').set(bearer(newDealer.token)).send({ nin: 'CM91002345SSAL', idPhotoEvidenceId: await upload(newDealer.token, 'official_document', await testPhoto('brian ssali id')) }));

// ---------------------------------------------------------------------------------------------- garage

log('Garage: Kansanga Motors, with a mechanic and jobs…');
const garageMgr = await person('Garage manager', '+256700400001', 'Sarah Nambi');
const garage = await business(garageMgr.token, 'garage', 'Kansanga Motors Ltd', 'Kansanga Motors', 'Kampala');
await approve(admin.token, garage, 'Workshop visited in Kansanga');
const G = (t: Token = garageMgr.token) => asOrg(t, garage);
await call(http.post('/v1/garage/staff').set(G()).send({ phone: '+256700400002', displayName: 'Musa Kizza', role: 'org_staff' }));
const mechanic = await person('Mechanic', '+256700400002', 'Musa Kizza', true);
const jobs: [string, number, string, string[]][] = [
  ['UBG 447L', 132_400, 'Full service: oil and filter, air filter. Front pads at 30%.', ['engine_oil', 'oil_filter', 'air_filter']],
  ['UBE 260R', 98_250, 'Service and wheel alignment. Customer asked about a rattle at the rear.', ['engine_oil', 'oil_filter']],
  ['UBF 119J', 156_900, 'Oil change. Advised new spark plugs at the next visit.', ['engine_oil']],
  ['UBH 031N', 74_600, 'Service before a long trip to Gulu.', ['engine_oil', 'oil_filter']],
];
for (const [plate, km, description, items] of jobs) {
  const vehicleRef = (await call(http.get('/v1/garage/vehicles/lookup').query({ plate }).set(G(mechanic.token)))).body.candidates[0]?.vehicleRef;
  if (!vehicleRef) continue;
  const id = randomUUID();
  const odometer = await upload(mechanic.token, 'odometer_photo', await testPhoto(`odometer ${plate} ${km}`));
  await call(http.put(`/v1/garage/jobs/${id}`).set(G(mechanic.token)).send({
    plateEntered: plate, vehicleRef, workTypes: ['service'], clientCreatedAt: new Date(Date.now() - 7200_000).toISOString(),
    form: { mileage: { value: km, unit: 'km', odometerPhotoId: odometer }, description, service: { items },
      customer: { name: 'Customer of Kansanga Motors', phone: `+2567524${String(km).slice(0, 5)}`, smsConsent: true },
      cost: { total: { amount: 180_000 + (km % 7) * 25_000, currency: 'UGX' }, method: 'mtn_momo' } } }));
  await submit(`/v1/garage/jobs/${id}/submit`, G(mechanic.token));
}
// A job on the cloned plate UAX 123A with no car picked: two cars carry that plate, so a SAZO reviewer must say
// which car it was (console: Vehicle matches). Until then the garage app shows it under Alerts as being checked.
{
  const id = randomUUID();
  const odometer = await upload(mechanic.token, 'odometer_photo', await testPhoto('odometer UAX 123A 88400'));
  await call(http.put(`/v1/garage/jobs/${id}`).set(G(mechanic.token)).send({
    plateEntered: 'UAX 123A', workTypes: ['service'], clientCreatedAt: new Date(Date.now() - 3600_000).toISOString(),
    form: { mileage: { value: 88_400, unit: 'km', odometerPhotoId: odometer }, description: 'Oil change. Customer said the car was bought last month.', service: { items: ['engine_oil'] },
      customer: { name: 'Customer of Kansanga Motors', phone: '+256752488400', smsConsent: true }, cost: { total: { amount: 160_000, currency: 'UGX' }, method: 'cash' } } }));
  await submit(`/v1/garage/jobs/${id}/submit`, G(mechanic.token));
}
const draftRef = (await call(http.get('/v1/garage/vehicles/lookup').query({ plate: 'UBD 640H' }).set(G(mechanic.token)))).body.candidates[0]?.vehicleRef;
await call(http.put(`/v1/garage/jobs/${randomUUID()}`).set(G(mechanic.token)).send({ plateEntered: 'UBD 640H', ...(draftRef ? { vehicleRef: draftRef } : {}), workTypes: ['service'],
  clientCreatedAt: new Date().toISOString(), form: { description: 'Car in the bay now. Waiting for the customer to approve brake pads.' } }));
const tamperedRef = await ref('UBC 718P');
await call(http.post('/v1/concerns').set(G()).send({ plate: 'UBC 718P', ...(tamperedRef ? { vehicleRef: tamperedRef } : {}), category: 'odometer_tampered',
  description: 'Dashboard screws scratched and the pedals are worn far beyond the mileage shown',
  evidenceIds: [await upload(garageMgr.token, 'vehicle_photo', await carPhoto('fielder pedals', '#6b7280', 'fielder', 4))] }));
const pendingGarageMgr = await person('Garage waiting for approval', '+256700400003', 'Tom Ochieng');
await business(pendingGarageMgr.token, 'garage', 'Bugolobi Car Care Ltd', 'Bugolobi Car Care', 'Kampala');

// ---------------------------------------------------------------------------------------------- inspections

log('Inspection centre, with an inspection and booking requests…');
const inspector = await person('Inspection centre manager', '+256700500001', 'Denis Opio');
const centre = await business(inspector.token, 'inspection_centre', 'Bugolobi Vehicle Inspection Ltd', 'Bugolobi Vehicle Inspection', 'Kampala');
await approve(admin.token, centre, 'Centre visited; paint gauge and lift seen');
const I = asOrg(inspector.token, centre);
const axio = (await call(http.get('/v1/inspections/vehicles/lookup').query({ plate: 'UBK 703A' }).set(I))).body.candidates[0];
if (axio) {
  const id = randomUUID();
  await call(http.put(`/v1/inspections/${id}`).set(I).send({ plateEntered: 'UBK 703A', vehicleRef: axio.vehicleRef, clientCreatedAt: new Date(Date.now() - 3600_000).toISOString(), form: {
    mileage: { value: (axio.lastMileage?.km ?? 120_000) + 4_300, unit: 'km', odometerPhotoId: await upload(inspector.token, 'odometer_photo', await testPhoto('axio odometer')) },
    paint: { readings: [{ panel: 'bonnet', microns: 115 }, { panel: 'roof', microns: 108 }, { panel: 'front_left_door', microns: 121 }] },
    identity: { kindSeen: 'saloon' },
    structure: { damageFound: false }, tyres: { minTreadPercent: 55 }, battery: { ok: true },
    defects: [{ item: 'Wiper blades worn', severity: 'minor' }],
    result: { passed: true, summary: 'Good condition for its age; replace wiper blades' },
    photoIds: [await upload(inspector.token, 'vehicle_photo', await carPhoto('axio front', '#cbd5e1', 'axio', 1)), await upload(inspector.token, 'vehicle_photo', await carPhoto('axio back', '#cbd5e1', 'axio', 2))] } }));
  await submit(`/v1/inspections/${id}/submit`, I);
}

// D-148: the Hilux the dealer called an SUV: the inspector records a pickup (the records now disagree).
const hilux = (await call(http.get('/v1/inspections/vehicles/lookup').query({ plate: 'UBF 300T' }).set(I))).body.candidates[0];
if (hilux) {
  const id = randomUUID();
  await call(http.put(`/v1/inspections/${id}`).set(I).send({ plateEntered: 'UBF 300T', vehicleRef: hilux.vehicleRef, clientCreatedAt: new Date(Date.now() - 1800_000).toISOString(), form: {
    mileage: { value: 88_200, unit: 'km', odometerPhotoId: await upload(inspector.token, 'odometer_photo', await testPhoto('hilux odometer')) },
    identity: { kindSeen: 'pickup' },
    structure: { damageFound: false }, tyres: { minTreadPercent: 70 }, battery: { ok: true },
    result: { passed: true, summary: 'Double cab pickup in good order' },
    photoIds: [await upload(inspector.token, 'vehicle_photo', await carPhoto('hilux front', '#cbd5e1', 'hilux', 1)), await upload(inspector.token, 'vehicle_photo', await carPhoto('hilux back', '#cbd5e1', 'hilux', 2))] } }));
  await submit(`/v1/inspections/${id}/submit`, I);
}

// ---------------------------------------------------------------------------------------------- buyers

log('Buyers: saved cars, a shared report, an ownership claim, reviews and bookings…');
const buyer = await person('Buyer', '+256700600001', 'Mary Achieng');
for (const plate of ['UBJ 214K', 'UBK 482M', 'UAX 123A']) {
  const r = await ref(plate);
  if (r) await call(http.post('/v1/me/saved-checks').set(bearer(buyer.token)).send({ vehicleRef: r }));
}
const harrier = await ref('UBJ 214K');
if (harrier) await call(http.post(`/v1/vehicles/${harrier}/snapshots`).set(bearer(buyer.token)).send({ createShareLink: true, expiresInDays: 30 }));
const claimRef = await ref('UBF 590S');
if (claimRef) {
  const first = await http.post(`/v1/vehicles/${claimRef}/ownership-claims`).set(bearer(buyer.token)).send({});
  if (first.status === 422) {
    await call(http.post(`/v1/vehicles/${claimRef}/ownership-claims`).set(bearer(buyer.token)).send({ logbookEvidenceId: await upload(buyer.token, 'official_document', await testPhoto('mary logbook')) }));
  }
}
await call(http.post('/v1/bookings').set(bearer(buyer.token)).send({ organisationId: centre, plate: 'UBK 482M', preferredDate: day(2), ...(await ref('UBK 482M') ? { vehicleRef: await ref('UBK 482M') } : {}) }));
const accepted = (await call(http.post('/v1/bookings').set(bearer(buyer.token)).send({ organisationId: centre, plate: 'UBJ 214K', preferredDate: day(3) }))).body.bookingId;
await call(http.post(`/v1/inspection-bookings/${accepted}/decision`).set(I).send({ decision: 'accept', scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), note: 'Bring the logbook' }));
const secondBuyer = await person('Buyer (reviews)', '+256700600002', 'James Okot');
const axioRef = await ref('UBK 482M');
if (axioRef) {
  const modelId = (await call(http.get(`/v1/vehicles/${axioRef}/report`).set(bearer(buyer.token)))).body.model?.modelId;
  if (modelId) {
    await call(http.post(`/v1/models/${modelId}/reviews`).set(bearer(buyer.token)).send({ rating: 4, body: 'Cheap to run in Kampala traffic and parts are everywhere. The suspension bushes wear on bad roads.' }));
    await call(http.post(`/v1/models/${modelId}/reviews`).set(bearer(secondBuyer.token)).send({ rating: 3, body: 'Comfortable and easy to fix, but the CVT gearbox needs its fluid changed on time.' }));
    await call(http.post(`/v1/models/${modelId}/creator-links`).set(bearer(secondBuyer.token)).send({ url: 'https://www.youtube.com/watch?v=demo-premio-review', title: 'Toyota Premio after five years in Uganda' }));
  }
}

// D-148: James bought the Wish the dealer sold a month ago; SAZO confirmed his logbook and he logs his fill-ups.
const wishRef = await ref('UBJ 771K');
if (wishRef) {
  const claim = await http.post(`/v1/vehicles/${wishRef}/ownership-claims`).set(bearer(secondBuyer.token)).send({});
  if (claim.status === 422) {
    await call(http.post(`/v1/vehicles/${wishRef}/ownership-claims`).set(bearer(secondBuyer.token)).send({ logbookEvidenceId: await upload(secondBuyer.token, 'official_document', await testPhoto('james logbook')) }));
    const pending = (await call(http.get('/v1/admin/ownership-claims').set(bearer(admin.token)))).body.items as { claimId: string; vehicleRef: string }[];
    const mine = pending.find((c) => c.vehicleRef === wishRef);
    if (mine) await call(http.post(`/v1/admin/ownership-claims/${mine.claimId}/decision`).set(bearer(admin.token)).send({ decision: 'approve', reason: 'Logbook names him; sale recorded by the dealer' }));
  }
  const fills: [number, number, number, boolean][] = [[-28, 40, 140_100, true], [-21, 38.5, 140_560, true], [-14, 20, 140_900, false], [-9, 22, 141_210, true], [-2, 36, 141_640, true]];
  for (const [d, litres, odometerKm, fullTank] of fills) {
    await call(http.post(`/v1/me/cars/${wishRef}/fuel`).set(bearer(secondBuyer.token)).send({ filledOn: day(d), litres, odometerKm, fullTank }));
  }
}

// ---------------------------------------------------------------------------------------------- done

log('\nDemo data loaded. Log in on the website (or the garage app) with a phone code, or with the email and the password below.\n');
log(`Password for every demo account: ${PASSWORD}\n`);
const width = Math.max(...people.map((x) => x.who.length));
for (const { who, p } of people) log(`  ${who.padEnd(width)}  ${p.phone}  ${p.email}`);
log(`\nSAZO staff (admin and reviewer) use an authenticator app: add the key ${DEMO_AUTHENTICATOR_KEY} to it by hand (time based).`);
log('Everyone else gets a code by SMS on a new device. Codes and emails are printed in the API window, as usual on a developer computer.');
await app.close();
