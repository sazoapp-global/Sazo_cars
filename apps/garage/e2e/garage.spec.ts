// The mechanic's day on a phone: sign in, record a service with an odometer photo, send it; then lose
// signal halfway through the next job and watch it sync when the signal comes back.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API_LOG, API_PORT } from '../playwright.config';

const API = `http://localhost:${API_PORT}/v1`;
const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567010${stamp}`;
const MANAGER = `+2567020${stamp}`;
const MANAGER_LOCAL = `0${MANAGER.slice(4)}`; // how a mechanic types it: 0702…
// A tiny real PNG — the app shrinks and re-encodes it like a camera photo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDEgARQGAG2jA/2T4ZbXAAAAAElFTkSuQmCC', 'base64');

/** Set SHOTS=<folder> to save screenshots of each step (design review). */
const shot = async (page: Page, name: string) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };
const lastCode = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO code is (\d{6})/g)].at(-1)![1]!;

async function apiSignIn(request: APIRequestContext, phone: string, displayName: string): Promise<string> {
  await request.post(`${API}/auth/otp/request`, { data: { phone } });
  await new Promise((r) => setTimeout(r, 200));
  const res = await request.post(`${API}/auth/otp/verify`, { data: { phone, code: lastCode(), displayName } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken;
}

async function signInInApp(page: Page, localPhone: string) {
  await page.goto('/');
  await page.getByLabel('Your phone number').fill(localPhone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.beforeAll(async ({ request }) => {
  // A SAZO admin (made with the create-admin script) approves a new garage registered by its manager.
  execFileSync('npx', ['tsx', 'src/scripts/create-admin.ts', '--phone', ADMIN, '--name', 'E2E Admin'], { cwd: '../api', env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe' });
  const adminToken = await apiSignIn(request, ADMIN, 'E2E Admin');
  const managerToken = await apiSignIn(request, MANAGER, 'Sarah Manager');
  const org = await request.post(`${API}/organisations`, { headers: { Authorization: `Bearer ${managerToken}` }, data: { type: 'garage', legalName: `Kansanga Motors ${stamp} Ltd`, tradingName: 'Kansanga Motors' } });
  expect(org.ok()).toBeTruthy();
  const approved = await request.post(`${API}/admin/organisations/${(await org.json()).id}/decision`, { headers: { Authorization: `Bearer ${adminToken}` }, data: { decision: 'approve', reason: 'E2E' } });
  expect(approved.ok()).toBeTruthy();
});

test('record a service with an odometer photo and send it', async ({ page }) => {
  await signInInApp(page, MANAGER_LOCAL);
  await expect(page.getByText('Kansanga Motors')).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Number plate').fill('ubj 214k');
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByText('2016 Toyota Harrier')).toBeVisible();
  await shot(page, '1-car');
  await page.getByRole('button', { name: 'Yes, this is the car' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Service' }).click();
  await shot(page, '2-work');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Odometer reading').fill('110500');
  await expect(page.getByLabel('Odometer reading')).toHaveValue('110,500');
  await page.locator('input[type=file]').setInputFiles({ name: 'odo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText(/Odometer photo/)).toBeVisible();
  await shot(page, '3-mileage');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Engine oil' }).click();
  await page.getByRole('button', { name: 'Oil filter' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Customer name').fill('Peter Okello');
  await page.getByLabel('Customer phone').fill('0772 555 789');
  await page.getByLabel(/agreed to get one SMS/).check();
  await page.getByLabel('Total charged').fill('250000');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Peter Okello · will get an SMS')).toBeVisible();
  await shot(page, '5-review');
  await page.getByRole('button', { name: 'Send to SAZO' }).click();
  await expect(page.getByRole('heading', { name: 'Added to the car’s history' })).toBeVisible();
  await expect(page.getByText('The customer will get an SMS')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  const job = page.getByRole('button', { name: /UBJ 214K/ }).first();
  await expect(job).toContainText('In vehicle history');
  await expect(job).toContainText('Waiting for customer');
  await expect(job).toContainText('by Sarah Manager');
  await shot(page, '6-home');
});

test('no signal halfway through a job: everything is kept and syncs when the signal returns', async ({ page, context }) => {
  await signInInApp(page, MANAGER_LOCAL);
  await expect(page.getByRole('button', { name: 'New job' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('No signal — saving on phone')).toBeVisible();
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Number plate').fill('UBR 404N');
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByText('No signal — carry on.')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Electrical work' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Odometer reading').fill('64200');
  await page.locator('input[type=file]').setInputFiles({ name: 'odo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText(/Odometer photo/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Back home while still offline: the job waits on the phone.
  await page.getByRole('button', { name: /SAZO Garage/ }).click();
  const draft = page.getByRole('button', { name: /UBR 404N/ });
  await expect(draft).toContainText('Saved on phone · will upload when online');
  await shot(page, '7-offline-home');

  await context.setOffline(false);
  await expect(draft).toContainText('Saved to SAZO', { timeout: 20_000 });
});
