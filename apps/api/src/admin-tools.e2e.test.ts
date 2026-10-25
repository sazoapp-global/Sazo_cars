// SAZO admin use cases A-05 to A-07: managers' National ID checked at business approval, announcements under
// the bell for each group, and help questions and answers with every change kept. Over HTTP on a fresh database.
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
import { ConsoleSmsSender } from './modules/notify/index.js';
import { signInWithCode, approveOrg } from './test-auth.js';
import { testPhoto } from './test-photos.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('admin identity checks, announcements and FAQs (e2e)', () => {
  const dbName = `sazo_admt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const evidenceDir = path.join(os.tmpdir(), dbName);
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;
  let reviewerToken: string;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const signIn = (phone: string, name?: string) => signInWithCode(app, http, phone, name);

  async function upload(token: string, kind: string, seed: string): Promise<string> {
    const bytes = await testPhoto(seed);
    const slot = await http.post('/v1/evidence/uploads').set(bearer(token))
      .send({ kind, mimeType: 'image/jpeg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }).expect(201);
    await http.put(new URL(slot.body.uploadUrl).pathname).set(bearer(token)).set('Content-Type', 'image/jpeg').send(bytes).expect(204);
    return (await http.post(`/v1/evidence/${slot.body.evidenceId}/complete`).set(bearer(token)).expect(200)).body.evidenceId;
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
    const iam = app.get(IamService);
    adminToken = (await app.get(AuthService).issueTokens(await iam.ensureUser('+256700000974', 'Test Admin', 'sazo_admin'))).accessToken;
    reviewerToken = (await app.get(AuthService).issueTokens(await iam.ensureUser('+256700000975', 'Test Reviewer', 'sazo_reviewer'))).accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    await rm(evidenceDir, { recursive: true, force: true });
  });

  let manager: string;
  let orgId: string;
  const as = (t: string) => ({ ...bearer(t), 'X-Organisation-Id': orgId });

  it('A-05: a manager may send a National ID (optional, D-141), and approving the business approves the ID', async () => {
    manager = await signIn('+256772620001', 'Sarah Garage Manager');
    orgId = (await http.post('/v1/organisations').set(bearer(manager)).send({ type: 'garage', legalName: 'Ntinda Motors Ltd' }).expect(201)).body.id;
    expect((await http.get(`/v1/admin/organisations/${orgId}/managers`).set(bearer(adminToken)).expect(200)).body.items).toEqual([expect.objectContaining({ identity: 'missing' })]);

    const nosy = await signIn('+256772620009', 'Nosy Person');
    const theirs = await upload(nosy, 'official_document', 'someone else id');
    expect((await http.post('/v1/me/identity').set(bearer(manager)).send({ nin: 'CM90000000ABCD', idPhotoEvidenceId: theirs }).expect(422)).body.code).toBe('id_photo_invalid');
    const photo = await upload(manager, 'official_document', 'sarah national id');
    await http.post('/v1/me/identity').set(bearer(manager)).send({ nin: '12345', idPhotoEvidenceId: photo }).expect(400);
    expect((await http.post('/v1/me/identity').set(bearer(manager)).send({ nin: 'cm90000000abcd', idPhotoEvidenceId: photo }).expect(201)).body.status).toBe('pending');
    expect((await http.post('/v1/me/identity').set(bearer(manager)).send({ nin: 'CM90000000ABCD', idPhotoEvidenceId: photo }).expect(409)).body.code).toBe('already_sent');
    expect(JSON.stringify((await db.query('SELECT * FROM iam.identity_checks')).rows)).not.toContain('CM90000000ABCD');

    const managers = (await http.get(`/v1/admin/organisations/${orgId}/managers`).set(bearer(adminToken)).expect(200)).body.items;
    expect(managers).toEqual([expect.objectContaining({ identity: 'pending', nin: 'CM90000000ABCD', idPhotoEvidenceId: photo })]);
    await http.post(`/v1/admin/organisations/${orgId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Workshop and ID checked' }).expect(200);
    expect((await http.get('/v1/me/identity').set(bearer(manager)).expect(200)).body.check).toMatchObject({ status: 'approved' });

    // The console popup: one person's account at a glance, for admins only; each look is audited.
    const person = (await http.get(`/v1/admin/people/${managers[0].userId}`).set(bearer(adminToken)).expect(200)).body;
    expect(person).toMatchObject({ userId: managers[0].userId, phone: expect.any(String), identity: { status: 'approved', nin: 'CM90000000ABCD' },
      businesses: [expect.objectContaining({ organisationId: orgId, role: 'org_manager', organisationStatus: 'approved' })] });
    await http.get(`/v1/admin/people/${managers[0].userId}`).set(bearer(manager)).expect(403);
    await http.get('/v1/admin/people/not-a-uuid').set(bearer(adminToken)).expect(404);
    // The console overview's recent activity: staff decisions in plain words, not account look-ups.
    const activity = (await http.get('/v1/admin/activity').set(bearer(adminToken)).expect(200)).body.items;
    expect(activity[0]).toMatchObject({ actor: expect.any(String), text: expect.stringMatching(/^approved /), at: expect.any(String) });
    expect(JSON.stringify(activity)).not.toMatch(/person viewed|account /);
    await http.get('/v1/admin/activity').set(bearer(manager)).expect(403);
    expect((await db.query(`SELECT count(*)::int AS n FROM iam.audit_entries WHERE action = 'person.viewed' AND target_id = $1`, [managers[0].userId])).rows[0].n).toBe(1);
  });

  it('A-05: a manager added later is checked on their own; a rejection says why and they can send again', async () => {
    await http.post('/v1/garage/staff').set(as(manager)).send({ phone: '+256772620002', displayName: 'Peter Second Manager', role: 'org_manager' }).expect(201);
    const second = await signIn('+256772620002');
    const blurry = await upload(second, 'official_document', 'peter blurry id');
    await http.post('/v1/me/identity').set(bearer(second)).send({ nin: 'CM90000000EFGH', idPhotoEvidenceId: blurry }).expect(201);
    await http.get('/v1/admin/identity-checks').set(bearer(reviewerToken)).expect(403);
    const queue = (await http.get('/v1/admin/identity-checks').set(bearer(adminToken)).expect(200)).body.items;
    const check = queue.find((c: { nin: string }) => c.nin === 'CM90000000EFGH');
    expect(check).toMatchObject({ person: { name: expect.stringContaining('Peter') }, businesses: [expect.objectContaining({ name: 'Ntinda Motors Ltd' })] });
    await http.post(`/v1/admin/identity-checks/${check.checkId}/decision`).set(bearer(adminToken)).send({ decision: 'reject', reason: 'Photo unreadable' }).expect(200);
    expect(app.get(ConsoleSmsSender, { strict: false }).latest('+256772620002')).toContain('Photo unreadable');
    expect((await http.get('/v1/me/identity').set(bearer(second)).expect(200)).body.check).toMatchObject({ status: 'rejected', decisionReason: 'Photo unreadable' });
    const clear = await upload(second, 'official_document', 'peter clear id');
    const again = (await http.post('/v1/me/identity').set(bearer(second)).send({ nin: 'CM90000000EFGH', idPhotoEvidenceId: clear }).expect(201)).body;
    await http.post(`/v1/admin/identity-checks/${again.checkId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Clear photo, number matches' }).expect(200);
    expect((await http.post(`/v1/admin/identity-checks/${again.checkId}/decision`).set(bearer(adminToken)).send({ decision: 'approve', reason: 'Again' }).expect(409)).body.code).toBe('already_decided');
    // One ID number backs one person.
    const third = await signIn('+256772620003', 'Copy Cat');
    const copy = await upload(third, 'official_document', 'copy id');
    expect((await http.post('/v1/me/identity').set(bearer(third)).send({ nin: 'CM90000000ABCD', idPhotoEvidenceId: copy }).expect(409)).body.code).toBe('nin_in_use');
  });

  it('A-06: announcements reach their group under the bell, can be marked read and withdrawn', async () => {
    const buyer = await signIn('+256772620010', 'Grace Buyer');
    await http.post('/v1/admin/announcements').set(bearer(reviewerToken)).send({ audience: 'everyone', title: 'Hello', body: 'Hello all' }).expect(403);
    const toGarages = (await http.post('/v1/admin/announcements').set(bearer(adminToken)).send({ audience: 'garages', title: 'new job form', body: 'The job form now asks for the engine number.' }).expect(201)).body;
    expect(toGarages.title).toBe('New job form');
    await http.post('/v1/admin/announcements').set(bearer(adminToken)).send({ audience: 'everyone', title: 'SAZO is in testing', body: 'Records are simulated for now.' }).expect(201);
    const forManager = (await http.get('/v1/me/announcements').set(bearer(manager)).expect(200)).body;
    expect(forManager.unread).toBe(2);
    const forBuyer = (await http.get('/v1/me/announcements').set(bearer(buyer)).expect(200)).body;
    expect(forBuyer.items.map((a: { title: string }) => a.title)).toEqual(['SAZO is in testing']);
    // A buyer cannot mark a garage announcement read, but can mark their own.
    await http.post('/v1/me/announcements/read').set(bearer(buyer)).send({ ids: [toGarages.id, forBuyer.items[0].id] }).expect(204);
    expect((await http.get('/v1/me/announcements').set(bearer(buyer)).expect(200)).body.unread).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM help.announcement_reads WHERE announcement_id = $1', [toGarages.id])).rows[0].n).toBe(0);
    await http.post(`/v1/admin/announcements/${toGarages.id}/withdraw`).set(bearer(adminToken)).expect(204);
    expect((await http.post(`/v1/admin/announcements/${toGarages.id}/withdraw`).set(bearer(adminToken)).expect(409)).body.code).toBe('already_withdrawn');
    expect((await http.get('/v1/me/announcements').set(bearer(manager)).expect(200)).body.items.map((a: { title: string }) => a.title)).toEqual(['SAZO is in testing']);
    const all = (await http.get('/v1/admin/announcements').set(bearer(adminToken)).expect(200)).body.items;
    expect(all.find((a: { id: string }) => a.id === toGarages.id).withdrawnAt).toBeTruthy();
  });

  it('A-07: FAQs are drafted, published or hidden for a group, and every change is kept', async () => {
    await http.post('/v1/admin/faqs').set(bearer(reviewerToken)).send({ audience: 'everyone', topic: 'Help', question: 'What is SAZO?', answer: 'A car history service.' }).expect(403);
    const draft = (await http.post('/v1/admin/faqs').set(bearer(adminToken))
      .send({ audience: 'garages', topic: 'jobs', question: 'how do i correct a job?', answer: 'Open the job and send a correction; the first record stays in the history.' }).expect(201)).body;
    expect(draft).toMatchObject({ status: 'draft', topic: 'Jobs', question: 'How do i correct a job?' });
    await http.post('/v1/admin/faqs').set(bearer(adminToken)).send({ audience: 'everyone', topic: 'About', question: 'Is SAZO free?', answer: 'Yes, checking a car is free for now.', status: 'published' }).expect(201);
    expect((await http.get('/v1/help/faqs').expect(200)).body.items.map((f: { question: string }) => f.question)).toEqual(['Is SAZO free?']);
    await http.patch(`/v1/admin/faqs/${draft.id}`).set(bearer(adminToken)).send({ status: 'published' }).expect(200);
    expect((await http.get('/v1/help/faqs').set(bearer(manager)).expect(200)).body.items.map((f: { question: string }) => f.question)).toEqual(['Is SAZO free?', 'How do i correct a job?']);
    const buyer = await signIn('+256772620011', 'Another Buyer');
    expect((await http.get('/v1/help/faqs').set(bearer(buyer)).expect(200)).body.items).toHaveLength(1);
    await http.patch(`/v1/admin/faqs/${draft.id}`).set(bearer(adminToken)).send({ status: 'hidden' }).expect(200);
    expect((await http.get('/v1/help/faqs').set(bearer(manager)).expect(200)).body.items).toHaveLength(1);
    const changes = (await http.get(`/v1/admin/faqs/${draft.id}/changes`).set(bearer(adminToken)).expect(200)).body.items;
    expect(changes.map((c: { before: { status?: string } | null; after: { status: string } }) => [c.before?.status ?? null, c.after.status])).toEqual([['published', 'hidden'], ['draft', 'published'], [null, 'draft']]);
    await expect(db.query(`UPDATE help.faq_changes SET after = '{}'`)).rejects.toThrow();
    await http.patch('/v1/admin/faqs/00000000-0000-4000-8000-000000000000').set(bearer(adminToken)).send({ status: 'hidden' }).expect(404);
  });

  it('every business approval goes through the same identity rule (test helper)', async () => {
    const t = await signIn('+256772620020', 'Dealer Owner');
    const id = (await http.post('/v1/organisations').set(bearer(t)).send({ type: 'dealer', legalName: 'Kireka Bond Ltd' }).expect(201)).body.id;
    expect((await approveOrg(app, http, adminToken, id)).body.status).toBe('approved');
  });
});
