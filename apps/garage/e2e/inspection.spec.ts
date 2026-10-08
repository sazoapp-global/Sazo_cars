// An inspector's job on a phone (P-004): find the car, mileage with a photo, what the car shows (colour,
// paint thickness), condition, photos, result — then a finding that differs from the records is explained and sent.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API_LOG, API_PORT } from '../playwright.config';

const API = `http://localhost:${API_PORT}/v1`;
const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567030${stamp}`;
const MANAGER = `+2567040${stamp}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEJMDEgARQGAG2jA/2T4ZbXAAAAAElFTkSuQmCC', 'base64');
const shot = async (page: Page, name: string) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };
const lastCode = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO code is (\d{6})/g)].at(-1)![1]!;
const a11y = async (page: Page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
};

async function apiSignIn(request: APIRequestContext, phone: string, displayName: string): Promise<string> {
  await request.post(`${API}/auth/otp/request`, { data: { phone } });
  await new Promise((r) => setTimeout(r, 200));
  const res = await request.post(`${API}/auth/otp/verify`, { data: { phone, code: lastCode(), displayName } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken;
}

test.beforeAll(async ({ request }) => {
  execFileSync('npx', ['tsx', 'src/scripts/create-admin.ts', '--phone', ADMIN, '--name', 'E2E Admin 2'], { cwd: '../api', env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe' });
  const adminToken = await apiSignIn(request, ADMIN, 'E2E Admin 2');
  const managerToken = await apiSignIn(request, MANAGER, 'Denis Inspector');
  const org = await request.post(`${API}/organisations`, { headers: { Authorization: `Bearer ${managerToken}` }, data: { type: 'inspection_centre', legalName: `Bugolobi Inspection ${stamp} Ltd`, tradingName: 'Bugolobi Inspection' } });
  expect(org.ok()).toBeTruthy();
  const approved = await request.post(`${API}/admin/organisations/${(await org.json()).id}/decision`, { headers: { Authorization: `Bearer ${adminToken}` }, data: { decision: 'approve', reason: 'E2E check' } });
  expect(approved.ok()).toBeTruthy();
});

test('inspect a car and send the checklist', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your phone number').fill(`0${MANAGER.slice(4)}`);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('SAZO Inspect')).toBeVisible();
  await expect(page.getByText('Bugolobi Inspection')).toBeVisible();
  await a11y(page);

  await page.getByRole('button', { name: 'New inspection' }).click();
  await page.getByLabel('Number plate').fill('ubk 703a');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByRole('button', { name: 'Yes, this is the car' }).click();
  await shot(page, 'i1-car');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Odometer reading').fill('300000');
  await page.locator('input[type=file]').setInputFiles({ name: 'odo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText(/Odometer photo/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Colour').fill('Lime green');
  await a11y(page);
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel(/^Bonnet/).fill('410');
  await page.getByLabel(/^Roof/).fill('120');
  await expect(page.getByText('1 panel looks repainted')).toBeVisible();
  await a11y(page);
  await shot(page, 'i2-paint');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByRole('button', { name: 'None found' }).click();
  await page.getByLabel(/Tread left/).fill('55');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByLabel('What is wrong?').fill('Rear wiper not working');
  await page.getByRole('button', { name: 'Add as minor' }).click();
  await expect(page.getByText('Rear wiper not working')).toBeVisible();
  await a11y(page);
  await shot(page, 'i3-condition');
  await page.getByRole('button', { name: 'Next' }).click();

  const files = page.locator('input[type=file]');
  await files.nth(0).setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText(/Front of the car/)).toBeVisible();
  await files.nth(1).setInputFiles({ name: 'back.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText(/Back of the car/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Passed', exact: true }).click();
  await expect(page.getByText('2 panels measured · 1 thick')).toBeVisible();
  await a11y(page);
  await shot(page, 'i4-review');
  await page.getByRole('button', { name: 'Send to SAZO' }).click();
  // The colour seen differs from the record: explain, then send.
  await expect(page.getByText(/The colour you saw \(Lime green\)/)).toBeVisible();
  await page.getByLabel('Explain what you checked').fill('Wrapped in green vinyl; original paint visible in door shuts');
  await page.getByRole('button', { name: 'Send to SAZO' }).click();
  await expect(page.getByRole('heading', { name: 'Added to the car’s history' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  const sent = page.getByRole('button', { name: /UBK 703A/ }).first();
  await expect(sent).toContainText('In vehicle history');
  await expect(sent).toContainText('Passed');
  await sent.click();
  await expect(page.getByText('Thick on Bonnet')).toBeVisible();
  await expect(page.getByText('Rear wiper not working')).toBeVisible();
  await shot(page, 'i5-sent');
});

test('report a problem with a car (O-002) and follow what SAZO decides', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your phone number').fill(`0${MANAGER.slice(4)}`);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Report a problem with a car' }).click();
  await expect(page.getByRole('heading', { name: 'Report a problem with a car' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send to SAZO' })).toBeDisabled();
  await page.getByLabel('Number plate *').fill('UBG 909K');
  await page.getByLabel(/Chassis or VIN looks tampered with/).check();
  await page.getByLabel('What did you see? *').fill('Chassis stamp ground off and re-punched; letters uneven');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'chassis.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByAltText(/Photo \(optional\)/)).toBeVisible();
  await a11y(page);
  await shot(page, 'c1-report');
  await page.getByRole('button', { name: 'Send to SAZO' }).click();
  await expect(page.getByText('Thank you. SAZO will check it')).toBeVisible();
  const mine = page.getByRole('listitem').filter({ hasText: 'UBG 909K' });
  await expect(mine).toContainText('Chassis or VIN looks tampered with');
  await expect(mine).toContainText('SAZO is checking');
});
