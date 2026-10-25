import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_LOG } from '../playwright.config';

export const API = 'http://localhost:3100/v1';
const codes = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO (?:sign-in )?code (?:to [a-z ]+ )?is (\d{6})/g)];
export const codesSoFar = () => codes().length;
export const lastCode = () => codes().at(-1)![1]!;

/** Set SHOTS=<folder> to save screenshots for design review. */
export const shot = async (page: Page, name: string) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };

export async function a11y(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

/** The sign-up details for a made-up adult from a short name ("Ruth Akello" → first Ruth, surname Akello). */
export function personFor(name: string) {
  const words = name.replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/);
  return { firstName: words[0]!, surname: words.length > 1 ? words.slice(1).join(' ') : 'Test' };
}

/** Plays the authenticator app for SAZO staff (D-145): the RFC 6238 code for a key shown on the set-up page. */
export function totp(key: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const ch of key.replace(/\s/g, '')) { value = (value << 5) | alphabet.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1_000_000).padStart(6, '0');
}

/** The keys staff set up in these tests, by phone, shared by every test worker (each code works once). */
const KEYS = path.join(tmpdir(), 'sazo-e2e-authenticator-keys.json');
type Keys = Record<string, { key: string; step: number }>;
const readKeys = (): Keys => (existsSync(KEYS) ? JSON.parse(readFileSync(KEYS, 'utf8')) as Keys : {});
export function rememberKey(phone: string, key: string, step = Math.floor(Date.now() / 30_000)) {
  writeFileSync(KEYS, JSON.stringify({ ...readKeys(), [phone]: { key, step } }));
}
/** A code for this person's app that hasn't been used yet (waits for the next 30 seconds if needed). */
export async function nextAppCode(phone: string): Promise<string> {
  const k = readKeys()[phone];
  if (!k) throw new Error(`No authenticator key remembered for ${phone}`);
  let step = Math.floor(Date.now() / 30_000);
  while (step <= k.step) { await new Promise((r) => setTimeout(r, 1000)); step = Math.floor(Date.now() / 30_000); }
  rememberKey(phone, k.key, step);
  return totp(k.key, step * 30_000);
}

/** SAZO staff's first log-in: set up the app from the page, then pass the backup codes page. */
export async function setUpAuthenticator(page: Page, phone?: string): Promise<string> {
  await page.getByRole('button', { name: 'Show my QR code' }).click();
  await page.getByText(/Can.t scan\? Type this key instead/).click();
  const key = (await page.getByTestId('totp-key').textContent())!.replace(/\s/g, '');
  if (phone) rememberKey(phone, key);
  await page.getByLabel('6-digit code from the app').fill(totp(key));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible();
  await page.getByRole('button', { name: 'I have saved them' }).click();
  return key;
}

/** Wait for the next code in the API log and type it. */
async function typeNextCode(page: Page, before: number, label = '6-digit code') {
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel(label).fill(lastCode());
}

/**
 * Log in through the website with a phone code, or — with `name` — create the account first (D-100).
 * `phone` is +256…; it is typed the local way (07…). A second step (sensitive roles) is answered too.
 */
export async function signIn(page: Page, phone: string, opts: { name?: string; next?: string } = {}) {
  const next = encodeURIComponent(opts.next ?? '/');
  if (opts.name) {
    await page.goto(`/sign-up?next=${next}`);
    const panel = page.getByRole('main'); // phone code is the default
    const p = personFor(opts.name);
    await panel.getByLabel('Surname').fill(p.surname);
    await panel.getByLabel('Given name').fill(p.firstName);
    await panel.getByLabel('Female').check();
    await panel.getByLabel('Date of birth').fill('1990-03-15');
    await panel.getByLabel('Mobile number').fill(`0${phone.slice(4)}`);
    const before = codesSoFar();
    await panel.getByRole('button', { name: 'Send code' }).click();
    await expect(panel.getByLabel('6-digit code')).toBeVisible();
    await typeNextCode(page, before);
    await panel.getByRole('button', { name: 'Create Free Account' }).click();
  } else {
    await page.goto(`/sign-in?next=${next}`);
    const panel = page.getByRole('main');
    await panel.getByLabel('Mobile number').fill(`0${phone.slice(4)}`);
    let before = codesSoFar();
    await panel.getByRole('button', { name: 'Send code' }).click();
    await expect(panel.getByLabel('6-digit code')).toBeVisible();
    await typeNextCode(page, before);
    before = codesSoFar();
    await panel.getByRole('button', { name: 'Log in to SAZO' }).click();
    // A second step on a new device when the account has a confirmed email (D-145); SAZO staff then set up their app.
    await page.waitForURL((u) => !/\/sign-in$/.test(u.pathname));
    if (new URL(page.url()).pathname === '/sign-in/verify' && await page.getByText('Open your authenticator app').isVisible()) {
      await page.getByLabel('6-digit code').fill(await nextAppCode(phone));
      await page.getByRole('button', { name: 'Confirm' }).click();
      await page.waitForURL((u) => u.pathname !== '/sign-in/verify');
    } else if (new URL(page.url()).pathname === '/sign-in/verify') {
      await typeNextCode(page, before);
      await page.getByRole('button', { name: 'Confirm' }).click();
      await page.waitForURL((u) => u.pathname !== '/sign-in/verify');
    }
    if (new URL(page.url()).pathname === '/sign-in/authenticator') await setUpAuthenticator(page, phone);
  }
  await expect(page).not.toHaveURL(/\/sign-(in|up)/);
}

/**
 * Log in through the API (tests that set data up directly). With `name`, create the account first if the
 * number has none. A second step (SAZO staff, managers) is answered from the API log.
 */
export async function apiToken(request: APIRequestContext, phone: string, name?: string): Promise<string> {
  let before = codesSoFar();
  const signup = name ? (await request.post(`${API}/auth/otp/request`, { data: { phone, intent: 'signup' } })).ok() : false;
  if (!signup) expect((await request.post(`${API}/auth/otp/request`, { data: { phone, intent: 'login' } })).ok()).toBeTruthy();
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  before = codesSoFar();
  const p = name ? personFor(name.replace(/[^\p{L}\s]/gu, ' ')) : undefined;
  let body = await (await request.post(`${API}/auth/otp/verify`, { data: { phone, code: lastCode(), ...(signup && p ? { signup: { ...p, gender: 'female', dateOfBirth: '1990-03-15' } } : {}) } })).json();
  if (body.status === 'second_step' && body.channel === 'authenticator') {
    body = await (await request.post(`${API}/auth/second-step`, { data: { challengeId: body.challengeId, code: await nextAppCode(phone), rememberDevice: false } })).json();
  } else if (body.status === 'second_step') {
    await expect.poll(codesSoFar).toBeGreaterThan(before);
    body = await (await request.post(`${API}/auth/second-step`, { data: { challengeId: body.challengeId, code: lastCode(), rememberDevice: false } })).json();
  }
  if (body.status === 'setup_authenticator') {
    const { secret } = await (await request.post(`${API}/auth/authenticator/start`, { data: { setupToken: body.setupToken } })).json();
    rememberKey(phone, secret);
    body = await (await request.post(`${API}/auth/authenticator/confirm`, { data: { setupToken: body.setupToken, code: totp(secret) } })).json();
  }
  expect(body.accessToken).toBeTruthy();
  return body.accessToken as string;
}

export function createAdmin(phone: string, name: string) {
  const p = personFor(name.replace(/[^\p{L}\s]/gu, ' '));
  execFileSync('npx', ['tsx', 'src/scripts/create-admin.ts', '--phone', phone, '--surname', p.surname, '--first', p.firstName, '--gender', 'female', '--dob', '1985-06-01'],
    { cwd: '../api', env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe' });
}

/**
 * A real, distinct PNG photo for upload tests (X-01: SAZO checks photos are readable, big and bright
 * enough, and not copies). Each seed draws its own pattern, so no two count as the same picture.
 */
export function testPhoto(seed: string, width = 480, height = 360): Buffer {
  const h = createHash('sha512').update(seed).digest();
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const v = 40 + (h[(Math.floor((y * 8) / height) * 8 + Math.floor((x * 8) / width)) % 64]! % 200);
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = v; raw[o + 1] = v; raw[o + 2] = Math.max(0, v - 20);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * A-05: a business manager sends a made-up National ID through the API (a business is approved only once its
 * managers have sent theirs). `seed` makes the ID photo and number unique.
 */
export async function sendIdentity(request: APIRequestContext, token: string, seed: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const bytes = testPhoto(`national id ${seed}`);
  const slot = await (await request.post(`${API}/evidence/uploads`, { headers, data: {
    kind: 'official_document', mimeType: 'image/png', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } })).json();
  expect((await request.put(`${API}/evidence/uploads/${slot.evidenceId}/content`, { headers: { ...headers, 'Content-Type': 'image/png' }, data: bytes })).ok()).toBeTruthy();
  expect((await request.post(`${API}/evidence/${slot.evidenceId}/complete`, { headers })).ok()).toBeTruthy();
  const nin = `CM${createHash('sha256').update(seed).digest('hex').slice(0, 12).toUpperCase()}`;
  expect((await request.post(`${API}/me/identity`, { headers, data: { nin, idPhotoEvidenceId: slot.evidenceId } })).ok()).toBeTruthy();
}
