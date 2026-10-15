import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { API_LOG } from '../playwright.config';

export const API = 'http://localhost:3100/v1';
const codes = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO (?:sign-in )?code (?:to move your account to this number )?is (\d{6})/g)];
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
    await panel.getByLabel('First name').fill(p.firstName);
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
    // SAZO staff, managers and dealers: a second step on a new device (D-105).
    await page.waitForURL((u) => !/\/sign-in$/.test(u.pathname) || u.pathname === '/sign-in/verify');
    if (new URL(page.url()).pathname === '/sign-in/verify') {
      await typeNextCode(page, before);
      await page.getByRole('button', { name: 'Confirm' }).click();
    }
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
  if (body.status === 'second_step') {
    await expect.poll(codesSoFar).toBeGreaterThan(before);
    body = await (await request.post(`${API}/auth/second-step`, { data: { challengeId: body.challengeId, code: lastCode(), rememberDevice: false } })).json();
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
