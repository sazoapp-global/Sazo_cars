// A buyer saves two cars, compares them, shares a frozen report (opened without signing in, then
// stopped), and adds a car SAZO doesn't know yet.
import { expect, test } from '@playwright/test';
import { a11y, shot, signIn } from './helpers';

const stamp = String(Date.now()).slice(-7);
const BUYER = `+2567090${stamp}`;

test('save, compare, share and stop sharing', async ({ page, browser }) => {
  await signIn(page, BUYER, { name: 'Brenda Buyer' });
  for (const plate of ['UBJ214K', 'UBC718P']) {
    await page.goto(`/check?q=${plate}`);
    await page.getByRole('button', { name: 'Save this car' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  }

  await page.getByRole('link', { name: 'Saved' }).first().click();
  await expect(page.getByRole('heading', { name: 'Saved cars' })).toBeVisible();
  await a11y(page);
  await page.getByRole('checkbox', { name: /Compare 2016 Toyota Harrier/ }).check();
  await page.getByRole('checkbox', { name: /Compare 2015 Toyota RAV4/ }).check();
  await page.getByRole('button', { name: 'Compare selected' }).click();
  await expect(page.getByRole('heading', { name: 'Compare cars' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Mileage.*differs/ })).toBeVisible();
  await a11y(page);
  await shot(page, 'compare');

  await page.goto('/check?q=UBJ214K');
  await page.getByRole('button', { name: 'Share or save as PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Your link is ready' })).toBeVisible();
  const url = (await page.locator('p.sazo-id').first().textContent())!.trim();

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(url);
  await expect(stranger.getByRole('heading', { level: 1, name: '2016 Toyota Harrier' })).toBeVisible();
  await expect(stranger.getByText(/a copy frozen on/)).toBeVisible();
  await expect(stranger.getByRole('button', { name: 'Save as PDF' })).toBeVisible();
  await a11y(stranger);
  await shot(stranger, 'shared');

  await page.getByRole('button', { name: 'Stop this link' }).first().click();
  await expect(page.getByText(/· stopped/).first()).toBeVisible();
  await stranger.reload();
  await expect(stranger.getByRole('heading', { name: 'This link is not valid' })).toBeVisible();
});

test('add a car SAZO does not know: it shows as not yet confirmed', async ({ page }) => {
  await signIn(page, `+2567091${stamp}`, { name: 'Owen Owner' });
  const plate = `UBX ${stamp.slice(-3)}Q`;
  await page.goto(`/check?q=${encodeURIComponent(plate)}`);
  await expect(page.getByRole('heading', { name: "We couldn't find this vehicle" })).toBeVisible();
  await page.getByLabel('Make *').fill('Subaru');
  await page.getByLabel('Model *').fill('Forester');
  await page.getByLabel('Year *').fill('2013');
  await page.getByRole('button', { name: 'Add car' }).click();
  await expect(page).toHaveURL(/\/v\/SZV-/);
  await expect(page.getByText('Not yet confirmed by an official record', { exact: true })).toBeVisible();
});
