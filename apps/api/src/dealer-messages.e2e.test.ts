// Messages in the dealer system (D-173): the dealer's team (managers and sales staff) and brokers. Who may read
// and write each conversation, which cars may go in a message, unread counts and "Seen".
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
import { signInWithCode, approveOrg } from './test-auth.js';
import { testPhoto } from './test-photos.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('messages between a dealer team and brokers (e2e)', () => {
  const dbName = `sazo_dmsg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
  let closedCar: string;
  let quietOrg: string;
  let broker1: string;
  let broker2: string;
  let privateChat: string;

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
    const adminId = await app.get(IamService).ensureUser('+256700000993', 'Test Admin', 'sazo_admin');
    adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    manager = await signIn('+256772810001', 'Joseph Manager');
    orgId = (await http.post('/v1/organisations').set(bearer(manager)).send({ type: 'dealer', legalName: 'Ntinda Cars Ltd', tradingName: 'Ntinda Cars' }).expect(201)).body.id;
    await approveOrg(app, http, adminToken, orgId, 'Yard visited');
    await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772810002', displayName: 'Lucy Sales', role: 'org_staff' }).expect(201);
    staff = await signIn('+256772810002');
    const add = async (chassis: string, price: number, details: object, org = orgId, t = manager) =>
      (await http.post('/v1/dealer/stock').set(as(t, org)).send({ chassisNumber: chassis, askingPriceUgx: price, details }).expect(201)).body.stockId as string;
    openFixed = await add('ZRR70-0566111', 50_000_000, { make: 'Toyota', model: 'Voxy', commissionKind: 'fixed', commissionFixedUgx: 500_000 });
    closedCar = await add('ZRR70-0566333', 30_000_000, { make: 'Nissan', model: 'Note', openToBrokers: false, commissionKind: 'fixed', commissionFixedUgx: 300_000 });
    // A second approved dealer with no cars open to brokers.
    const other = await signIn('+256772810003', 'Other Manager');
    quietOrg = (await http.post('/v1/organisations').set(bearer(other)).send({ type: 'dealer', legalName: 'Quiet Motors Ltd' }).expect(201)).body.id;
    await approveOrg(app, http, adminToken, quietOrg, 'Yard visited');
    await add('ZRR70-0566444', 20_000_000, { make: 'Honda', model: 'Fit', openToBrokers: false }, quietOrg, other);
    broker1 = await approvedBroker('+256772810021', 'Ivan Kato', 'ivan.msg@example.com', 'CM11113333ABCD');
    broker2 = await approvedBroker('+256772810022', 'Grace Atim', 'grace.msg@example.com', 'CF33335555ABCD');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  it('a broker writes to a dealer with cars open to brokers, with one of those cars, and nowhere else', async () => {
    const plain = await signIn('+256772810030', 'Not A Broker');
    await http.get('/v1/broker/messages').set(bearer(plain)).expect(403);
    await http.post(`/v1/broker/messages/${orgId}`).set(bearer(plain)).send({ body: 'Hello' }).expect(403);

    const list = (await http.get('/v1/broker/messages').set(bearer(broker1)).expect(200)).body;
    expect(list.conversations).toEqual([]);
    expect(list.dealers.map((d: { organisationId: string }) => d.organisationId)).toEqual([orgId]); // not Quiet Motors

    expect((await http.post(`/v1/broker/messages/${quietOrg}`).set(bearer(broker1)).send({ body: 'Hello' }).expect(404)).body.code).toBe('dealer_not_open');
    expect((await http.post(`/v1/broker/messages/${orgId}`).set(bearer(broker1)).send({ body: 'About this one', stockId: closedCar }).expect(422)).body.code).toBe('car_not_allowed');
    await http.post(`/v1/broker/messages/${orgId}`).set(bearer(broker1)).send({ body: '' }).expect(400);
    await http.post(`/v1/broker/messages/${orgId}`).set(bearer(broker1)).send({ body: 'a customer of mine wants to see this one. is it still here?', stockId: openFixed }).expect(201);

    const thread = (await http.get(`/v1/broker/messages/${orgId}`).set(bearer(broker1)).expect(200)).body;
    expect(thread.title).toBe('Ntinda Cars');
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({ mine: true, body: 'A customer of mine wants to see this one. Is it still here?', seen: false });
    expect(thread.messages[0].car).toMatchObject({ stockId: openFixed, name: expect.stringContaining('Voxy'), askingPriceUgx: 50_000_000, inStock: true });
    expect(thread.members.map((m: { role: string }) => m.role).sort()).toEqual(['Manager', 'Sales']);
  });

  it("the whole team sees a broker's conversation, each with their own unread count, and replies show who wrote", async () => {
    expect((await http.get('/v1/dealer/messages/unread').set(as(manager)).expect(200)).body.unread).toBe(1);
    expect((await http.get('/v1/dealer/messages/unread').set(as(staff)).expect(200)).body.unread).toBe(1);
    const items = (await http.get('/v1/dealer/messages').set(as(manager)).expect(200)).body.items;
    const withBroker = items.find((c: { kind: string }) => c.kind === 'broker');
    expect(withBroker).toMatchObject({ title: 'Kato Ivan', unread: 1, last: { sender: 'Kato Ivan', hasCar: true } });
    expect(items.find((c: { kind: string }) => c.kind === 'team')).toMatchObject({ title: 'Ntinda Cars team', unread: 0 });

    const opened = (await http.get(`/v1/dealer/messages/${withBroker.conversationId}`).set(as(manager)).expect(200)).body;
    expect(opened.messages[0]).toMatchObject({ mine: false, sender: { name: 'Kato Ivan', role: 'Broker' } });
    expect((await http.get('/v1/dealer/messages/unread').set(as(manager)).expect(200)).body.unread).toBe(0);
    expect((await http.get('/v1/dealer/messages/unread').set(as(staff)).expect(200)).body.unread).toBe(1); // Lucy has not read it

    await http.post(`/v1/dealer/messages/${withBroker.conversationId}`).set(as(staff)).send({ body: 'I can show it on Saturday from 10.' }).expect(201);
    expect((await http.get('/v1/broker/messages/unread').set(bearer(broker1)).expect(200)).body.unread).toBe(1);
    const broker = (await http.get(`/v1/broker/messages/${orgId}`).set(bearer(broker1)).expect(200)).body;
    expect(broker.messages[0].seen).toBe(true); // read by the dealer's team
    expect(broker.messages[1]).toMatchObject({ mine: false, sender: { name: 'Lucy Sales', role: 'Sales' } });
    expect((await http.get('/v1/broker/messages/unread').set(bearer(broker1)).expect(200)).body.unread).toBe(0);
    const again = (await http.get(`/v1/dealer/messages/${withBroker.conversationId}`).set(as(manager)).expect(200)).body;
    // Lucy's reply has been read by the broker and, now, by the manager who opened it.
    expect(again.seenBy).toEqual(expect.arrayContaining([{ name: 'Kato Ivan', you: false }, { name: 'Manager Joseph', you: true }]));
    expect(again.seenBy).toHaveLength(2);
  });

  it("the team's own conversation is for the team only, and any car in stock may go in it", async () => {
    await http.post('/v1/dealer/messages/team').set(as(staff)).send({ body: 'This one needs new tyres before Saturday.', stockId: closedCar }).expect(201);
    const team = (await http.get('/v1/dealer/messages/team').set(as(manager)).expect(200)).body;
    expect(team.title).toBe('Ntinda Cars team');
    expect(team.messages[0].car.stockId).toBe(closedCar);
    // A broker has no way in: not through the dealer's side, and not through their own.
    await http.get('/v1/dealer/messages/team').set(as(broker1)).expect(403);
    await http.get(`/v1/dealer/messages/${team.conversationId}`).set(as(broker1)).expect(403);
    const list = (await http.get('/v1/broker/messages').set(bearer(broker1)).expect(200)).body;
    expect(list.conversations.map((c: { kind: string }) => c.kind)).toEqual(['broker']);
  });

  it("a broker never sees another broker's conversation, and other dealers never see this one", async () => {
    const other = (await http.get(`/v1/broker/messages/${orgId}`).set(bearer(broker2)).expect(200)).body;
    expect(other.conversationId).toBeNull();
    expect(other.messages).toEqual([]);
    const items = (await http.get('/v1/dealer/messages').set(as(manager)).expect(200)).body.items;
    const withBroker = items.find((c: { kind: string }) => c.kind === 'broker');
    const quietManager = await signIn('+256772810003');
    await http.get(`/v1/dealer/messages/${withBroker.conversationId}`).set(as(quietManager, quietOrg)).expect(404);
    await http.post(`/v1/dealer/messages/${withBroker.conversationId}`).set(as(quietManager, quietOrg)).send({ body: 'Hello' }).expect(404);
  });

  it('two members of the team have a private chat that no one else sees, not even another manager (D-177)', async () => {
    await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772810004', displayName: 'Peter Second', role: 'org_manager' }).expect(201);
    const peter = await signIn('+256772810004');
    const lucy = (await http.get('/v1/me').set(bearer(staff)).expect(200)).body.id as string;
    const people = (await http.get('/v1/dealer/messages/people').set(as(manager)).expect(200)).body;
    expect(people.teamSize).toBe(3);
    expect(people.people.map((p: { name: string; role: string }) => `${p.name} ${p.role}`).sort()).toEqual(['Lucy Sales Sales', 'Peter Second Manager']);
    expect(people.people.every((p: { conversationId: string | null }) => p.conversationId === null)).toBe(true);

    privateChat = (await http.post('/v1/dealer/messages/direct').set(as(manager)).send({ userId: lucy }).expect(201)).body.conversationId;
    // Whoever starts it, a pair has one chat.
    const me = (await http.get('/v1/me').set(bearer(manager)).expect(200)).body.id as string;
    expect((await http.post('/v1/dealer/messages/direct').set(as(staff)).send({ userId: me }).expect(201)).body.conversationId).toBe(privateChat);
    // Not with yourself, someone outside the team, or a broker.
    expect((await http.post('/v1/dealer/messages/direct').set(as(manager)).send({ userId: me }).expect(422)).body.code).toBe('not_on_team');
    const brokerId = (await http.get('/v1/me').set(bearer(broker1)).expect(200)).body.id as string;
    await http.post('/v1/dealer/messages/direct').set(as(manager)).send({ userId: brokerId }).expect(422);

    await http.post(`/v1/dealer/messages/${privateChat}`).set(as(manager)).send({ body: 'Lucy, can you call the Voxy buyer?', stockId: closedCar }).expect(201);
    const lucyView = (await http.get(`/v1/dealer/messages/${privateChat}`).set(as(staff)).expect(200)).body;
    expect(lucyView).toMatchObject({ kind: 'direct', title: 'Manager Joseph', role: 'Manager', closed: false });
    expect(lucyView.people.map((p: { name: string; you: boolean }) => [p.name, p.you])).toEqual([['Manager Joseph', false], ['Lucy Sales', true]]);
    expect(lucyView.messages[0]).toMatchObject({ mine: false, sender: { name: 'Manager Joseph', role: 'Manager' } });
    const lucyList = (await http.get('/v1/dealer/messages').set(as(staff)).expect(200)).body.items;
    expect(lucyList.find((c: { kind: string }) => c.kind === 'direct')).toMatchObject({ title: 'Manager Joseph', role: 'Manager' });

    // The other manager sees neither the chat in the list nor the chat itself, and cannot write in it.
    const peterList = (await http.get('/v1/dealer/messages').set(as(peter)).expect(200)).body.items;
    expect(peterList.map((c: { kind: string }) => c.kind)).not.toContain('direct');
    await http.get(`/v1/dealer/messages/${privateChat}`).set(as(peter)).expect(404);
    await http.post(`/v1/dealer/messages/${privateChat}`).set(as(peter)).send({ body: 'Hello' }).expect(404);
    expect((await http.get('/v1/dealer/messages/unread').set(as(peter)).expect(200)).body.unread).toBe(3); // the team's and the broker's, not the private one
    // Nor does a broker, or another dealer.
    await http.get(`/v1/dealer/messages/${privateChat}`).set(as(broker1)).expect(403);
    const quietManager = await signIn('+256772810003');
    await http.get(`/v1/dealer/messages/${privateChat}`).set(as(quietManager, quietOrg)).expect(404);
  });

  it('staff who leave the team lose access at once', async () => {
    const lucy = (await http.get('/v1/me').set(bearer(staff)).expect(200)).body.id as string;
    await db.query(`UPDATE iam.memberships SET status = 'removed' WHERE organisation_id = $1 AND user_id = $2`, [orgId, lucy]);
    await http.get('/v1/dealer/messages').set(as(staff)).expect(403);
    await http.post('/v1/dealer/messages/team').set(as(staff)).send({ body: 'Still here?' }).expect(403);
    // Her messages stay, marked as someone who left the team.
    const team = (await http.get('/v1/dealer/messages/team').set(as(manager)).expect(200)).body;
    expect(team.messages[0].sender).toMatchObject({ name: 'Lucy Sales', role: 'Left the team' });
    expect(team.members.map((m: { role: string }) => m.role).sort()).toEqual(['Manager', 'Manager']);
    // Her private chat stays for the manager, closed to new messages.
    const chat = (await http.get(`/v1/dealer/messages/${privateChat}`).set(as(manager)).expect(200)).body;
    expect(chat).toMatchObject({ closed: true, role: 'Left the team' });
    expect(chat.messages).toHaveLength(1);
    expect((await http.post(`/v1/dealer/messages/${privateChat}`).set(as(manager)).send({ body: 'Are you there?' }).expect(422)).body.code).toBe('person_left');
  });
});
