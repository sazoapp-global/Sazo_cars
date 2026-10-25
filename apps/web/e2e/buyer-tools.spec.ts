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

  // My SAZO (top bar): the person's own things, then Settings and Sign out.
  await page.getByRole('button', { name: 'My SAZO' }).click();
  await page.getByRole('group', { name: 'My SAZO' }).getByRole('link', { name: 'Saved cars' }).click();
  await expect(page.getByRole('heading', { name: 'Saved cars' })).toBeVisible();
  await a11y(page);
  await page.getByRole('checkbox', { name: /Compare 2016 Toyota Harrier/ }).check();
  await page.getByRole('checkbox', { name: /Compare 2015 Toyota RAV4/ }).check();
  await page.getByRole('button', { name: 'Compare selected' }).click();
  await expect(page.getByRole('heading', { name: 'Compare cars' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Mileage.*differs/ })).toBeVisible();
  await a11y(page);
  await shot(page, 'compare');

  // The compare pop-up opens from a report's Compare button: add a car by plate, or browse cars for sale.
  await page.goto('/check?q=UBJ214K');
  await page.getByRole('link', { name: 'Compare', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare cars' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('listitem').filter({ hasText: '2016 Toyota Harrier' })).toBeVisible();
  const plate = dialog.getByLabel('Number plate, VIN or chassis number');
  await plate.fill('UBZ 000Z');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('SAZO has no records for UBZ 000Z');
  await plate.fill('UBC718P');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByRole('listitem').filter({ hasText: '2015 Toyota RAV4' })).toBeVisible();
  await dialog.getByRole('tab', { name: /Cars for sale/ }).click();
  await expect(dialog.getByRole('tabpanel')).toBeVisible();
  await a11y(page);
  await shot(page, 'compare-popup');
  await dialog.getByRole('button', { name: 'Compare 2 cars' }).click();
  await expect(page.getByRole('row', { name: /Mileage.*differs/ })).toBeVisible();

  await page.goto('/check?q=UBJ214K');
  await page.getByRole('button', { name: 'Share this report' }).click();
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

test('I-07: book an inspection from a report, then cancel it', async ({ page }) => {
  await signIn(page, `+2567092${stamp}`, { name: 'Ivan Booker' });
  await page.goto('/check?q=UBJ214K');
  await page.getByRole('link', { name: 'Book an inspection' }).first().click();
  await expect(page.getByRole('heading', { name: 'Book an inspection' })).toBeVisible();
  await expect(page.getByLabel('Number plate *')).toHaveValue('UBJ 214K');
  await a11y(page);
  await page.getByLabel('Where is the car?').fill('Ntinda, near the stage');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('status')).toContainText('Request sent');
  const booking = page.locator('li', { hasText: 'UBJ 214K' }).first();
  await expect(booking).toContainText('Waiting for the inspector');
  await expect(booking).toContainText('Ntinda, near the stage');
  await a11y(page);
  await shot(page, 'buyer-inspections');
  await booking.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('li', { hasText: 'UBJ 214K' }).first()).toContainText('Cancelled');
});
