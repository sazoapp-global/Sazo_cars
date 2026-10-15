// Shared by the garage app browser tests: log in through the API or the app, answering a second step
// (managers, D-105) from the codes the API prints in its log.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_LOG, API_PORT } from '../playwright.config';

export const API = `http://localhost:${API_PORT}/v1`;
const codes = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO (?:sign-in )?code is (\d{6})/g)];
export const codesSoFar = () => codes().length;
export const lastCode = () => codes().at(-1)![1]!;

const personFor = (name: string) => {
  const words = name.replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/);
  return { firstName: words[0]!, surname: words.length > 1 ? words.slice(1).join(' ') : 'Test' };
};

/** A SAZO admin with full details (create-admin script). */
export function createAdmin(phone: string, name: string) {
  const p = personFor(name);
  execFileSync('npx', ['tsx', 'src/scripts/create-admin.ts', '--phone', phone, '--surname', p.surname, '--first', p.firstName, '--gender', 'male', '--dob', '1984-02-02'],
    { cwd: '../api', env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe' });
}

/** Log in through the API; with `name`, create the account first if the number has none. */
export async function apiSignIn(request: APIRequestContext, phone: string, name?: string): Promise<string> {
  let before = codesSoFar();
  const signup = name ? (await request.post(`${API}/auth/otp/request`, { data: { phone, intent: 'signup' } })).ok() : false;
  if (!signup) expect((await request.post(`${API}/auth/otp/request`, { data: { phone, intent: 'login' } })).ok()).toBeTruthy();
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  before = codesSoFar();
  const p = name ? personFor(name) : undefined;
  let body = await (await request.post(`${API}/auth/otp/verify`, { data: { phone, code: lastCode(), ...(signup && p ? { signup: { ...p, gender: 'female', dateOfBirth: '1989-09-09' } } : {}) } })).json();
  if (body.status === 'second_step') {
    await expect.poll(codesSoFar).toBeGreaterThan(before);
    body = await (await request.post(`${API}/auth/second-step`, { data: { challengeId: body.challengeId, code: lastCode(), rememberDevice: false } })).json();
  }
  expect(body.accessToken).toBeTruthy();
  return body.accessToken as string;
}

/** Log in on the phone app with a phone code (and the second step, if asked). */
export async function signInInApp(page: Page, localPhone: string) {
  await page.goto('/');
  await page.getByLabel('Your phone number').fill(localPhone);
  let before = codesSoFar();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel('6-digit code').fill(lastCode());
  before = codesSoFar();
  await page.getByRole('button', { name: 'Log in' }).click();
  const second = page.getByRole('heading', { name: 'Confirm it’s you' });
  const home = page.getByRole('banner').or(page.getByRole('heading', { name: 'Finish your details' }));
  await expect(second.or(home)).toBeVisible();
  if (await second.isVisible()) {
    await expect.poll(codesSoFar).toBeGreaterThan(before);
    await page.getByLabel('6-digit code').fill(lastCode());
    await page.getByRole('button', { name: 'Confirm' }).click();
  }
  await expect(home).toBeVisible();
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
