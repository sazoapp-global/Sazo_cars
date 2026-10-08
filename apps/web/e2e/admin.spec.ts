// SAZO staff work their queues in the browser: approve a garage, settle a cloned plate, see the sources.
// Expects a freshly seeded database (CI makes one), because settling the plate changes data.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API_LOG } from '../playwright.config';

const API = 'http://localhost:3100/v1';
const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567030${stamp}`;
/** Set SHOTS=<folder> to save screenshots for design review. */
const shot = async (page: Page, name: string) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };
const codesSoFar = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO code is (\d{6})/g)].length;
const lastCode = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO code is (\d{6})/g)].at(-1)![1]!;

async function a11y(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

async function signIn(page: Page, phone: string, name?: string) {
  await page.goto('/sign-in?next=/admin');
  await page.getByLabel('Your phone number').fill(`0${phone.slice(4)}`);
  const before = codesSoFar();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByRole('button', { name: 'Continue' }).click();
  if (name) {
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Create account' }).click();
  }
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test.beforeAll(() => {
  execFileSync('npx', ['tsx', 'src/scripts/create-admin.ts', '--phone', ADMIN, '--name', 'Grace (SAZO admin)'], { cwd: '../api', env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe' });
});

test('people who are not SAZO staff cannot open the console', async ({ page }) => {
  await signIn(page, `+2567040${stamp}`, 'Just A Buyer');
  await expect(page).toHaveURL(/\/admin\/no-access/);
  await expect(page.getByRole('heading', { name: 'SAZO staff only' })).toBeVisible();
});

test('approve a garage that registered', async ({ page, request }) => {
  // A garage manager registers through the API (their sign-up screen comes later).
  const phone = `+2567050${stamp}`;
  const before = codesSoFar();
  await request.post(`${API}/auth/otp/request`, { data: { phone } });
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  const t = await (await request.post(`${API}/auth/otp/verify`, { data: { phone, code: lastCode(), displayName: 'Musa Manager' } })).json();
  await request.post(`${API}/organisations`, { headers: { Authorization: `Bearer ${t.accessToken}` }, data: { type: 'garage', legalName: `Bugolobi Car Care ${stamp} Ltd`, district: 'Kampala' } });

  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
  await shot(page, 'admin-home');
  await a11y(page);
  await page.getByRole('link', { name: 'Businesses', exact: true }).click();
  const card = page.getByRole('listitem').filter({ hasText: `Bugolobi Car Care ${stamp} Ltd` });
  await card.getByLabel(/Reason/).fill('Visited the workshop on Port Bell Road');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status')).toContainText('Decision recorded: approve');
  await page.goto('/admin/organisations?status=approved');
  await expect(page.getByRole('heading', { name: `Bugolobi Car Care ${stamp} Ltd` })).toBeVisible();
});

test('settle a cloned plate: the genuine car keeps it', async ({ page, request }) => {
  const search = await (await request.get(`${API}/vehicles/search?q=UAX%20123A`)).json();
  test.skip(search.outcome !== 'multiple', 'already settled in this database — run against a fresh seed');
  const genuine = search.matches.find((m: { currentPlate: string }) => m.currentPlate === 'UAX 123A').vehicleRef as string;

  await signIn(page, ADMIN);
  await page.goto('/admin/conflicts?topic=identity');
  await a11y(page);
  await page.getByRole('row').filter({ hasText: genuine }).getByRole('link', { name: 'Review' }).first().click();
  await expect(page.getByText('Disputed plate on this vehicle')).toBeVisible();
  await shot(page, 'admin-conflict');
  await a11y(page);
  await page.getByLabel('What happened').fill('The Harrier is using a copied plate');
  await page.getByLabel('Why you think so').fill('Registry record and chassis number match the Premio');
  await page.getByRole('radio', { name: new RegExp(genuine) }).check();
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByRole('status')).toContainText('Resolved');

  await page.goto('/check?q=UAX%20123A');
  await expect(page).toHaveURL(new RegExp(`/v/${genuine}`));
});

test('data sources show which are simulated', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/admin/sources');
  await expect(page.getByText('Simulated').first()).toBeVisible();
  await a11y(page);
});
