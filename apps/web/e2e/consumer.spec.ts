// The buyer journey in a real browser (phone-sized): search → public summary → sign in → full report.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API_LOG } from '../playwright.config';

async function noSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

/** The development SMS sender prints codes to the API log (the number is masked; tests run one at a time). */
function latestCode(): string {
  const codes = [...readFileSync(API_LOG, 'utf8').matchAll(/Your SAZO code is (\d{6})/g)];
  return codes.at(-1)![1]!;
}

test('search by plate lands on the public summary — statuses only, no figures', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('simulated', { exact: false }).first()).toBeVisible();
  await noSeriousA11yIssues(page);
  await page.getByLabel('Number plate, VIN or chassis number').fill('ubj214k');
  await page.getByRole('button', { name: 'Check this car' }).click();
  await expect(page).toHaveURL(/\/v\/SZV-/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2016 Toyota Harrier');
  await expect(page.getByRole('article')).toHaveCount(7); // the seven questions
  await expect(page.getByText('Mileage readings rise steadily over time.')).toBeVisible();
  // No figures in the public summary (P-002).
  await expect(page.locator('main')).not.toContainText(/UGX|\d{2,3},\d{3} km/);
  await noSeriousA11yIssues(page);
});

test('a plate on two cars shows both, with a cloned-plate warning', async ({ page }) => {
  await page.goto('/check?q=UAX%20123A');
  await expect(page.getByRole('heading', { name: /2 vehicles match/ })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'cloned plate' })).toHaveCount(2);
});

test('an unknown plate explains what to try next', async ({ page }) => {
  await page.goto('/check?q=UZZ%20999Z');
  await expect(page.getByRole('heading', { name: "We couldn't find this vehicle" })).toBeVisible();
});

test('sign in with a phone code, then read the full report, timeline and evidence', async ({ page }) => {
  const phone = `07${String(Date.now()).slice(-8)}`;
  await page.goto('/check?q=UBJ214K');
  await page.getByRole('link', { name: 'Sign in to see details' }).click();
  await page.getByLabel('Your phone number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await page.getByLabel('6-digit code').fill(latestCode());
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your name').fill('Test Buyer');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Back on the car, now with details.
  await expect(page.getByRole('heading', { name: 'Vehicle Health' })).toBeVisible();
  await expect(page.getByText('Estimated price range')).toBeVisible();
  await expect(page.getByText(/UGX \d+(\.\d)?M – UGX/)).toBeVisible();
  // The latest inspection (P-004) in plain words.
  const inspection = page.getByRole('region', { name: 'Latest inspection' });
  await expect(inspection).toContainText('Passed');
  await expect(inspection).toContainText('No structural damage found');
  await expect(inspection).toContainText('60% tread left on the most worn tyre');
  await expect(page.getByRole('link', { name: /Test Buyer/ })).toBeVisible();
  await noSeriousA11yIssues(page);

  await page.getByRole('link', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText('Garage visit').first()).toBeVisible();
  await expect(page.getByText('Confirmed by the customer').first()).toBeVisible();

  await page.getByRole('link', { name: 'Evidence', exact: true }).click();
  await page.getByRole('link', { name: 'Garage', exact: true }).click();
  await expect(page).toHaveURL(/class=garage/);
  // A garage's repair cost is never shown to buyers (P-007).
  await expect(page.locator('main')).not.toContainText('Cost recorded');

  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});
