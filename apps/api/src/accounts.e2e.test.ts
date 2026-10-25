// Accounts on a fresh database (D-100 – D-105): sign-up by email + password or phone + code, log-in never
// creates an account, confirmed email, forgot password, lock-outs, the profile progress bar, finishing the
// details of older accounts, a second step for sensitive roles, and Google sign-in (against a stand-in Google).
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { AuthService, IamService } from './modules/iam/index.js';
import { currentStep, totpAt } from './modules/iam/totp.js';
import { ConsoleEmailSender, ConsoleSmsSender } from './modules/notify/index.js';
import { signInWithCode, testSignup } from './test-auth.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = 'http://localhost:3001';

describe.skipIf(!base)('accounts (e2e)', () => {
  const dbName = `sazo_accounts_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const admin = new pg.Client({ connectionString: base });
  let db: pg.Client;
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  // A stand-in for Google's token and key endpoints: the test decides who "Google" says the person is.
  let google: Server;
  let googleUrl = '';
  const pendingClaims = new Map<string, Record<string, unknown>>();
  let signGoogle: (claims: Record<string, unknown>) => Promise<string>;

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const emailTo = (to: string) => app.get(ConsoleEmailSender, { strict: false }).latest(to);
  const smsTo = (to: string) => app.get(ConsoleSmsSender, { strict: false }).latest(to);
  const linkToken = (text: string | undefined) => text!.match(/token=([A-Za-z0-9_-]+)/)![1]!;
  const codeIn = (text: string | undefined) => text!.match(/\b(\d{6})\b/)![1]!;
  const adult = (extra: object = {}) => ({ surname: 'anguzu', firstName: 'MIKE', gender: 'male', dateOfBirth: '1991-04-20', ...extra });

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    google = createServer((req, res) => {
      if (req.url === '/jwks') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); return; }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        const form = new URLSearchParams(body);
        const claims = pendingClaims.get(form.get('code') ?? '');
        if (!claims || form.get('client_id') !== 'test-client' || !form.get('code_verifier')) { res.statusCode = 400; res.end('{}'); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id_token: await signGoogle(claims) }));
      });
    });
    await new Promise<void>((r) => google.listen(0, '127.0.0.1', r));
    googleUrl = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;
    signGoogle = (claims) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com').setAudience('test-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);

    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    app = await createApp(loadConfig({
      ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString(), PUBLIC_WEB_URL: WEB,
      GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_TOKEN_URL: `${googleUrl}/token`, GOOGLE_JWKS_URL: `${googleUrl}/jwks`,
    }));
    await app.listen(0);
    http = request(app.getHttpServer());
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.end();
    await new Promise((r) => google?.close(r));
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  const EMAIL = 'mike.anguzu@example.com';
  let mikeToken: string;

  it('sign up with email and password: details tidied, 18+ only, email confirmed by link (D-100, D-101, D-103)', async () => {
    const young = { ...adult({ dateOfBirth: `${new Date().getUTCFullYear() - 17}-06-01` }), email: EMAIL, password: 'river-stone-7' };
    expect((await http.post('/v1/auth/signup/email').send(young).expect(400)).body.detail).toBe('You must be 18 or older to use SAZO');
    expect((await http.post('/v1/auth/signup/email').send({ ...adult(), email: EMAIL, password: 'password123' }).expect(422)).body.code).toBe('weak_password');
    expect((await http.post('/v1/auth/signup/email').send({ ...adult(), email: EMAIL, password: 'short' }).expect(422)).body.detail).toBe('Use at least 8 characters');

    const res = await http.post('/v1/auth/signup/email').send({ ...adult({ middleName: 'james' }), email: '  Mike.Anguzu@Example.com ', password: 'river-stone-7' }).expect(201);
    expect(res.body).toMatchObject({ status: 'signed_in', created: true });
    mikeToken = res.body.accessToken;
    expect((await http.get('/v1/me').set(bearer(mikeToken)).expect(200)).body).toMatchObject({ displayName: 'Anguzu J. Mike', initials: 'AM', needsDetails: [] });
    expect((await http.post('/v1/auth/signup/email').send({ ...adult(), email: EMAIL, password: 'another-pass-9' }).expect(409)).body.code).toBe('account_exists');

    // Not yet confirmed: details + password done, email waiting, no phone.
    let p = (await http.get('/v1/me/profile').set(bearer(mikeToken)).expect(200)).body;
    expect(p).toMatchObject({ email: EMAIL, emailVerified: false, hasPassword: true, gender: 'male', dateOfBirth: '1991-04-20', progress: { percent: 50 } });

    const mail = emailTo(EMAIL)!;
    expect(mail.subject).toBe('Confirm your email for SAZO');
    expect(mail.text).toContain(`${WEB}/verify-email?token=`);
    await http.post('/v1/auth/email/verify').send({ token: linkToken(mail.text) }).expect(204);
    expect((await http.post('/v1/auth/email/verify').send({ token: linkToken(mail.text) }).expect(410)).body.code).toBe('invalid_link');
    p = (await http.get('/v1/me/profile').set(bearer(mikeToken)).expect(200)).body;
    expect(p.progress).toEqual({ percent: 75, items: [
      { key: 'details', label: 'Your details', done: true }, { key: 'phone', label: 'Confirmed phone number', done: false },
      { key: 'email', label: 'Confirmed email', done: true }, { key: 'password', label: 'Password', done: true },
    ] });

    // Date of birth is stored encrypted, never as text.
    const { rows: [u] } = await db.query(`SELECT dob_ciphertext, gender FROM iam.users WHERE lower(email) = $1`, [EMAIL]);
    expect(u.gender).toBe('male');
    expect(u.dob_ciphertext.toString('latin1')).not.toContain('1991');
  });

  it('log in with email and password; unknown emails are told to sign up; wrong passwords lock the account (D-105)', async () => {
    expect((await http.post('/v1/auth/password/sign-in').send({ email: 'nobody@example.com', password: 'whatever-123' }).expect(404)).body.code).toBe('no_account');
    expect((await http.post('/v1/auth/password/sign-in').send({ email: EMAIL, password: 'wrong-password' }).expect(401)).body.code).toBe('invalid_credentials');
    // A new device: everyone gets a second step (D-145). Mike has no phone yet, so the code comes by email.
    const ok = await http.post('/v1/auth/password/sign-in').send({ email: 'MIKE.ANGUZU@example.com', password: 'river-stone-7' }).expect(200);
    expect(ok.body).toMatchObject({ status: 'second_step', channel: 'email', sentTo: 'm••••••@example.com' });
    expect(ok.body.accessToken).toBeUndefined();
    const second = await http.post('/v1/auth/second-step').send({ challengeId: ok.body.challengeId, code: codeIn(emailTo(EMAIL)!.text), rememberDevice: false }).expect(200);
    // No phone on the account: he adds and confirms one before going in.
    expect(second.body).toMatchObject({ status: 'add_phone' });
    expect(second.body.accessToken).toBeUndefined();
    const setupToken = second.body.setupToken as string;
    expect((await http.post('/v1/auth/phone/add').send({ setupToken: 'x'.repeat(40), phone: '+256772900050' }).expect(410)).body.code).toBe('invalid_link');
    expect((await http.post('/v1/auth/phone/add').send({ setupToken, phone: '+256772900050' }).expect(202)).body).toEqual({ sentTo: '+256 ••• ••050' });
    expect(smsTo('+256772900050')).toContain('add this number');
    await http.post('/v1/auth/phone/confirm').send({ setupToken, phone: '+256772900050', code: codeIn(smsTo('+256772900050')) === '000000' ? '111111' : '000000' }).expect(401);
    const added = await http.post('/v1/auth/phone/confirm').send({ setupToken, phone: '+256772900050', code: codeIn(smsTo('+256772900050')) }).expect(200);
    expect(added.body).toMatchObject({ status: 'signed_in', created: false });
    expect((await http.get('/v1/me/profile').set(bearer(added.body.accessToken)).expect(200)).body.phone).toBe('+256772900050');
    // The set-up can't be used again.
    await http.post('/v1/auth/phone/add').send({ setupToken, phone: '+256772900051' }).expect(410);

    for (let i = 0; i < 10; i++) await http.post('/v1/auth/password/sign-in').send({ email: EMAIL, password: `wrong-${i}-password` }).expect(401);
    expect((await http.post('/v1/auth/password/sign-in').send({ email: EMAIL, password: 'river-stone-7' }).expect(423)).body.code).toBe('account_locked');

    // Every attempt is recorded (D-111) — and no password ever is.
    const { rows } = await db.query(`SELECT success, failure_reason, method FROM iam.login_attempts WHERE method = 'password' ORDER BY at`);
    expect(rows.filter((r) => r.success)).toHaveLength(1); // the sign-up; the log-in finished with its second step
    expect(rows.map((r) => r.failure_reason)).toEqual(expect.arrayContaining(['no_account', 'wrong_password', 'locked']));
    const dump = JSON.stringify((await db.query(`SELECT * FROM iam.login_attempts`)).rows);
    expect(dump).not.toMatch(/river-stone|wrong-1-password|mike\.anguzu/);
  });

  it('forgot password: an emailed link sets a new one and signs out every device', async () => {
    await http.post('/v1/auth/password/forgot').send({ email: 'nobody@example.com' }).expect(202);
    expect(emailTo('nobody@example.com')).toBeUndefined();
    await http.post('/v1/auth/password/forgot').send({ email: EMAIL }).expect(202);
    const mail = emailTo(EMAIL)!;
    expect(mail.subject).toBe('Reset your SAZO password');
    expect(mail.text).toContain('text a code to the phone');
    const token = linkToken(mail.text);
    // The link alone is not enough (D-145): a code is texted to the account's phone.
    expect((await http.post('/v1/auth/password/reset').send({ token, code: '123456', password: 'lake-victoria-22' }).expect(401)).body.code).toBe('invalid_code');
    expect((await http.post('/v1/auth/password/reset/code').send({ token: 'y'.repeat(40) }).expect(410)).body.code).toBe('invalid_link');
    expect((await http.post('/v1/auth/password/reset/code').send({ token }).expect(202)).body).toEqual({ sentTo: '+256 ••• ••050' });
    const sms = smsTo('+256772900050')!;
    expect(sms).toContain('reset your password');
    const code = codeIn(sms);
    await http.post('/v1/auth/password/reset').send({ token, code: code === '000000' ? '111111' : '000000', password: 'lake-victoria-22' }).expect(401);
    expect((await http.post('/v1/auth/password/reset').send({ token, code, password: '12345678' }).expect(422)).body.code).toBe('weak_password');
    // A wrong code or a refused password doesn't use up the link; a good one does.
    await http.post('/v1/auth/password/reset').send({ token, code, password: 'lake-victoria-22' }).expect(204);
    await http.post('/v1/auth/password/reset').send({ token, code, password: 'lake-victoria-23' }).expect(410);
    await http.get('/v1/me').set(bearer(mikeToken)).expect(401);
    expect(emailTo(EMAIL)!.subject).toBe('Your SAZO password was changed');
    // The new password also ends the lock-out; the second step now texts his phone.
    const again = await http.post('/v1/auth/password/sign-in').send({ email: EMAIL, password: 'lake-victoria-22' }).expect(200);
    expect(again.body).toMatchObject({ status: 'second_step', channel: 'sms' });
    mikeToken = (await http.post('/v1/auth/second-step').send({ challengeId: again.body.challengeId, code: codeIn(smsTo('+256772900050')) }).expect(200)).body.accessToken;
    expect(mikeToken).toBeTruthy();
  });

  it('a phone sign-up starts lower and completes the profile with email and password in Settings (D-102)', async () => {
    const phone = '+256772900001';
    expect((await http.post('/v1/auth/otp/request').send({ phone }).expect(404)).body.code).toBe('no_account');
    const token = await signInWithCode(app, http, phone, 'Ruth Akello');
    let p = (await http.get('/v1/me/profile').set(bearer(token)).expect(200)).body;
    expect(p).toMatchObject({ displayName: 'Akello Ruth', phone, email: null, hasPassword: false, progress: { percent: 50 } });

    expect((await http.post('/v1/me/email').set(bearer(token)).send({ email: EMAIL }).expect(409)).body.code).toBe('email_in_use');
    await http.post('/v1/me/email').set(bearer(token)).send({ email: 'ruth@example.com' }).expect(202);
    await http.post('/v1/auth/email/verify').send({ token: linkToken(emailTo('ruth@example.com')!.text) }).expect(204);
    await http.put('/v1/me/password').set(bearer(token)).send({ newPassword: 'papyrus-boat-4' }).expect(204);
    p = (await http.get('/v1/me/profile').set(bearer(token)).expect(200)).body;
    expect(p).toMatchObject({ email: 'ruth@example.com', emailVerified: true, hasPassword: true, progress: { percent: 100 } });
    // Changing it needs the current one; and now she can log in either way.
    expect((await http.put('/v1/me/password').set(bearer(token)).send({ newPassword: 'another-boat-5' }).expect(403)).body.code).toBe('wrong_password');
    await http.put('/v1/me/password').set(bearer(token)).send({ currentPassword: 'papyrus-boat-4', newPassword: 'another-boat-5' }).expect(204);
    expect((await http.post('/v1/auth/password/sign-in').send({ email: 'ruth@example.com', password: 'another-boat-5' }).expect(200)).body).toMatchObject({ status: 'second_step', channel: 'sms' });
    // Logging in by phone code: the second step goes to the confirmed email, so a stolen SIM alone is not enough.
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const byPhone = await http.post('/v1/auth/otp/verify').send({ phone, code: codeIn(smsTo(phone)) }).expect(200);
    expect(byPhone.body).toMatchObject({ status: 'second_step', channel: 'email', sentTo: 'r•••@example.com' });
    expect(emailTo('ruth@example.com')!.subject).toBe('Your SAZO sign-in code');
  });

  it('a phone code with no confirmed email is followed by the password, when the account has one (D-145)', async () => {
    const phone = '+256772900060';
    const token = await signInWithCode(app, http, phone, 'Paul Okello');
    await http.put('/v1/me/password').set(bearer(token)).send({ newPassword: 'mango-tree-41' }).expect(204);
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const r = await http.post('/v1/auth/otp/verify').send({ phone, code: codeIn(smsTo(phone)) }).expect(200);
    expect(r.body).toMatchObject({ status: 'second_step', channel: 'password' });
    expect(r.body.sentTo).toBeUndefined();
    expect((await http.post('/v1/auth/second-step').send({ challengeId: r.body.challengeId, code: 'not-my-password' }).expect(401)).body.detail).toBe('Wrong password');
    expect((await http.post('/v1/auth/second-step').send({ challengeId: r.body.challengeId, code: 'mango-tree-41' }).expect(200)).body.status).toBe('signed_in');
  });

  it('older accounts finish their details once; gender and date of birth then need SAZO staff to change (D-101)', async () => {
    const id = await app.get(IamService).ensureUser('+256772900010', 'Musa', 'consumer');
    const token = await signInWithCode(app, http, '+256772900010');
    expect((await http.get('/v1/me').set(bearer(token)).expect(200)).body.needsDetails).toEqual(['surname', 'gender', 'dateOfBirth']);
    await http.put('/v1/me/details').set(bearer(token)).send({ ...adult(), dateOfBirth: `${new Date().getUTCFullYear() - 15}-01-01` }).expect(400);
    await http.put('/v1/me/details').set(bearer(token)).send({ surname: 'kato', firstName: 'musa', gender: 'male', dateOfBirth: '1985-12-01' }).expect(204);
    expect((await http.get('/v1/me').set(bearer(token)).expect(200)).body).toMatchObject({ needsDetails: [], displayName: 'Kato Musa', initials: 'KM' });
    expect((await http.put('/v1/me/details').set(bearer(token)).send({ surname: 'Kato', firstName: 'Musa', gender: 'female', dateOfBirth: '1985-12-01' }).expect(409)).body.code).toBe('details_locked');
    expect(id).toBeTruthy();
  });

  it('sensitive roles need 12+ characters and a second step on a new device; a remembered device skips it (D-105)', async () => {
    const phone = '+256772900020';
    const token = await signInWithCode(app, http, phone, 'Joan Reviewer');
    const { rows: [u] } = await db.query(`SELECT id FROM iam.users WHERE phone_e164 = $1`, [phone]);
    await app.get(IamService).ensureUser(phone, 'ignored', 'sazo_reviewer'); // now SAZO staff
    await http.post('/v1/me/email').set(bearer(token)).send({ email: 'joan@sazo.example' }).expect(202);
    await http.post('/v1/auth/email/verify').send({ token: linkToken(emailTo('joan@sazo.example')!.text) }).expect(204);
    expect((await http.put('/v1/me/password').set(bearer(token)).send({ newPassword: 'nile-bank-7' }).expect(422)).body.detail).toBe('Use at least 12 characters');
    await http.put('/v1/me/password').set(bearer(token)).send({ newPassword: 'nile-river-bank-71' }).expect(204);
    expect((await http.get('/v1/me/profile').set(bearer(token)).expect(200)).body.strongPasswordRequired).toBe(true);

    // Password is right, but this device is new: a code goes to the phone.
    const first = await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: 'nile-river-bank-71' }).expect(200);
    expect(first.body).toMatchObject({ status: 'second_step', channel: 'sms', sentTo: '+256 ••• ••020' });
    expect(first.body.accessToken).toBeUndefined();
    const code = codeIn(smsTo(phone));
    expect(smsTo(phone)).toContain('sign-in code');
    await http.post('/v1/auth/second-step').send({ challengeId: first.body.challengeId, code: code === '000000' ? '111111' : '000000' }).expect(401);
    const done = await http.post('/v1/auth/second-step').send({ challengeId: first.body.challengeId, code, rememberDevice: true }).expect(200);
    await http.post('/v1/auth/second-step').send({ challengeId: first.body.challengeId, code }).expect(401); // used

    // SAZO staff must set up an authenticator app before going in (D-145).
    expect(done.body).toMatchObject({ status: 'setup_authenticator' });
    expect(done.body.accessToken).toBeUndefined();
    const setupToken = done.body.setupToken as string;
    const setup = (await http.post('/v1/auth/authenticator/start').send({ setupToken }).expect(200)).body;
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.otpauthUrl).toBe(`otpauth://totp/SAZO%3Ajoan%40sazo.example?secret=${setup.secret}&issuer=SAZO&algorithm=SHA1&digits=6&period=30`);
    const { rows: [stored] } = await db.query(`SELECT secret_ciphertext FROM iam.authenticators WHERE user_id = $1`, [u.id]);
    expect(stored.secret_ciphertext.toString('latin1')).not.toContain(setup.secret); // kept encrypted
    const step = currentStep();
    const wrong = totpAt(setup.secret, step) === '000000' ? '111111' : '000000';
    expect((await http.post('/v1/auth/authenticator/confirm').send({ setupToken, code: wrong }).expect(401)).body.code).toBe('invalid_code');
    const enrolled = await http.post('/v1/auth/authenticator/confirm').send({ setupToken, code: totpAt(setup.secret, step) }).expect(200);
    expect(enrolled.body).toMatchObject({ status: 'signed_in', created: false });
    expect(enrolled.body.deviceToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const backup = enrolled.body.backupCodes as string[];
    expect(backup).toHaveLength(10);
    expect(backup[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    await http.post('/v1/auth/authenticator/start').send({ setupToken }).expect(410); // done
    expect((await http.get('/v1/me/authenticator').set(bearer(enrolled.body.accessToken)).expect(200)).body).toEqual({ required: true, setUp: true, backupCodesLeft: 10 });

    // The remembered device logs straight in; another device uses the app, never SMS.
    expect((await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: 'nile-river-bank-71', deviceToken: enrolled.body.deviceToken }).expect(200)).body.status).toBe('signed_in');
    const smsBefore = smsTo(phone);
    const other = await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: 'nile-river-bank-71' }).expect(200);
    expect(other.body).toMatchObject({ status: 'second_step', channel: 'authenticator' });
    expect(other.body.sentTo).toBeUndefined();
    expect(smsTo(phone)).toBe(smsBefore);
    // The code already used at set-up can't be used again; the next one works.
    await http.post('/v1/auth/second-step').send({ challengeId: other.body.challengeId, code: totpAt(setup.secret, step) }).expect(401);
    expect((await http.post('/v1/auth/second-step').send({ challengeId: other.body.challengeId, code: totpAt(setup.secret, step + 1) }).expect(200)).body.status).toBe('signed_in');
    // A backup code works once, typed any way.
    const third = await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: 'nile-river-bank-71' }).expect(200);
    expect((await http.post('/v1/auth/second-step').send({ challengeId: third.body.challengeId, code: backup[0]!.toUpperCase().replace('-', ' ') }).expect(200)).body.status).toBe('signed_in');
    const fourth = await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: 'nile-river-bank-71' }).expect(200);
    await http.post('/v1/auth/second-step').send({ challengeId: fourth.body.challengeId, code: backup[0] }).expect(401);
    // A phone code is also followed by the app for staff.
    await http.post('/v1/auth/otp/request').send({ phone }).expect(202);
    const byPhone = await http.post('/v1/auth/otp/verify').send({ phone, code: codeIn(smsTo(phone)) }).expect(200);
    expect(byPhone.body).toMatchObject({ status: 'second_step', channel: 'authenticator' });

    // Lost phone: an administrator clears the app. Joan is signed out and sets up a new one at her next log-in.
    const adminId = await app.get(IamService).ensureUser('+256772900021', 'Admin', 'sazo_admin');
    await db.query(`INSERT INTO iam.authenticators (user_id, secret_ciphertext, key_version, confirmed_at) SELECT $1, secret_ciphertext, key_version, now() FROM iam.authenticators WHERE user_id = $2`, [adminId, u.id]);
    const adminToken = (await app.get(AuthService).issueTokens(adminId)).accessToken;
    await http.post(`/v1/admin/people/${u.id}/authenticator/reset`).set(bearer(token)).expect(403);
    await http.post(`/v1/admin/people/${adminId}/authenticator/reset`).set(bearer(adminToken)).expect(409);
    await http.post(`/v1/admin/people/${u.id}/authenticator/reset`).set(bearer(adminToken)).expect(200);
    await http.post(`/v1/admin/people/${u.id}/authenticator/reset`).set(bearer(adminToken)).expect(404);
    await http.get('/v1/me').set(bearer(enrolled.body.accessToken)).expect(401);
    const after = await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: 'nile-river-bank-71', deviceToken: enrolled.body.deviceToken }).expect(200);
    expect(after.body).toMatchObject({ status: 'second_step', channel: 'sms' }); // remembered devices were forgotten
    const again = await http.post('/v1/auth/second-step').send({ challengeId: after.body.challengeId, code: codeIn(smsTo(phone)) }).expect(200);
    expect(again.body.status).toBe('setup_authenticator');
    const { rows: audit } = await db.query(`SELECT action FROM iam.audit_entries WHERE target_id = $1 AND action LIKE 'account.authenticator%' ORDER BY at`, [u.id]);
    expect(audit.map((a) => a.action)).toEqual(['account.authenticator_set', 'account.authenticator_reset']);

    // Five wrong answers lock a sensitive account (ten for others). The used backup code above counts too.
    for (let i = 0; i < 4; i++) await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: `nope-${i}-nope-nope` }).expect(401);
    await http.post('/v1/auth/password/sign-in').send({ email: 'joan@sazo.example', password: 'nile-river-bank-71' }).expect(423);
    expect(u.id).toBeTruthy();
  });

  async function googleRoundTrip(claims: Record<string, unknown>) {
    const start = await http.post('/v1/auth/google/start').send({ redirectUri: `${WEB}/auth/google/callback` }).expect(200);
    const u = new URL(start.body.url);
    expect(u.searchParams.get('client_id')).toBe('test-client');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    const code = `code-${Math.random()}`;
    pendingClaims.set(code, { ...claims, nonce: start.body.nonce });
    return http.post('/v1/auth/google/finish').send({ code, redirectUri: `${WEB}/auth/google/callback`, codeVerifier: start.body.codeVerifier, nonce: start.body.nonce }).expect(200);
  }

  it('Google: a new person gives surname, gender and date of birth; next time Google logs straight in (D-100)', async () => {
    expect((await http.get('/v1/auth/google').expect(200)).body).toEqual({ enabled: true });
    await http.post('/v1/auth/google/start').send({ redirectUri: 'https://evil.example/callback' }).expect(400);

    const first = await googleRoundTrip({ sub: 'g-111', email: 'grace@gmail.com', email_verified: true, given_name: 'Grace', family_name: 'Nambi' });
    expect(first.body).toMatchObject({ status: 'needs_details', suggested: { firstName: 'Grace', surname: 'Nambi', email: 'grace@gmail.com' } });
    await http.post('/v1/auth/google/complete').send({ signupToken: first.body.signupToken, ...adult({ surname: 'Nambi', firstName: 'Grace', gender: 'female', dateOfBirth: '2012-01-01' }) }).expect(400);
    const made = await http.post('/v1/auth/google/complete').send({ signupToken: first.body.signupToken, ...adult({ surname: 'Nambi', firstName: 'Grace', gender: 'female' }) }).expect(201);
    expect(made.body).toMatchObject({ status: 'signed_in', created: true });
    expect((await http.get('/v1/me/profile').set(bearer(made.body.accessToken)).expect(200)).body).toMatchObject({ email: 'grace@gmail.com', emailVerified: true, hasGoogle: true, hasPassword: false, progress: { percent: 50 } });

    // Next time on a new device: a code to her email (no phone yet), then she is asked to add a phone.
    const again = await googleRoundTrip({ sub: 'g-111', email: 'grace@gmail.com', email_verified: true });
    expect(again.body).toMatchObject({ status: 'second_step', channel: 'email' });
    const graceNext = await http.post('/v1/auth/second-step').send({ challengeId: again.body.challengeId, code: codeIn(emailTo('grace@gmail.com')!.text) }).expect(200);
    expect(graceNext.body.status).toBe('add_phone');
    // With no phone she can't reset a password by herself.
    await http.post('/v1/auth/password/forgot').send({ email: 'grace@gmail.com' }).expect(202);
    expect((await http.post('/v1/auth/password/reset/code').send({ token: linkToken(emailTo('grace@gmail.com')!.text) }).expect(409)).body.code).toBe('phone_required');
    // A Google account with the same confirmed email as an existing SAZO account is linked to it.
    const mike = await googleRoundTrip({ sub: 'g-222', email: EMAIL, email_verified: true });
    expect(mike.body).toMatchObject({ status: 'second_step', channel: 'sms' });
    const mikeIn = await http.post('/v1/auth/second-step').send({ challengeId: mike.body.challengeId, code: codeIn(smsTo('+256772900050')) }).expect(200);
    expect((await http.get('/v1/me').set(bearer(mikeIn.body.accessToken)).expect(200)).body.displayName).toBe('Anguzu J. Mike');
    // A token Google didn't sign, or for another browser (nonce), is refused.
    const start = await http.post('/v1/auth/google/start').send({ redirectUri: `${WEB}/auth/google/callback` }).expect(200);
    pendingClaims.set('bad-nonce', { sub: 'g-333', nonce: 'someone-elses-nonce' });
    expect((await http.post('/v1/auth/google/finish').send({ code: 'bad-nonce', redirectUri: `${WEB}/auth/google/callback`, codeVerifier: start.body.codeVerifier, nonce: start.body.nonce }).expect(502)).body.code).toBe('google_failed');
  });

  it('test helper sanity: testSignup gives an adult with tidy names', () => {
    expect(testSignup('Sarah Namukasa')).toMatchObject({ firstName: 'Sarah', surname: 'Namukasa' });
  });
});
