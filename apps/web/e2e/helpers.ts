import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { API_LOG } from '../playwright.config';

export const API = 'http://localhost:3100/v1';
const codes = () => [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO code is (\d{6})/g)];
export const codesSoFar = () => codes().length;
export const lastCode = () => codes().at(-1)![1]!;

/** Set SHOTS=<folder> to save screenshots for design review. */
export const shot = async (page: Page, name: string) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };

export async function a11y(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

/** Sign in through the website. `phone` is +256…; it is typed the local way (07…). */
export async function signIn(page: Page, phone: string, opts: { name?: string; next?: string } = {}) {
  await page.goto(`/sign-in?next=${encodeURIComponent(opts.next ?? '/')}`);
  await page.getByLabel('Your phone number').fill(`0${phone.slice(4)}`);
  const before = codesSoFar();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByRole('button', { name: 'Continue' }).click();
  if (opts.name) {
    await page.getByLabel('Your name').fill(opts.name);
    await page.getByRole('button', { name: 'Create account' }).click();
  }
  await expect(page).not.toHaveURL(/\/sign-in/);
}

export function createAdmin(phone: string, name: string) {
  execFileSync('npx', ['tsx', 'src/scripts/create-admin.ts', '--phone', phone, '--name', name], { cwd: '../api', env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL }, stdio: 'pipe' });
}
