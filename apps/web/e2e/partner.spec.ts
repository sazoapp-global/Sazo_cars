// A data partner (here a SAZO admin feeding the simulated sources) sends one record by hand and a CSV file.
import { expect, test } from '@playwright/test';
import { a11y, createAdmin, shot, signIn } from './helpers';

const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567080${stamp}`;

test.beforeAll(() => createAdmin(ADMIN, 'Paul (data entry)'));

test('one police record by hand: the car now shows an open stolen report', async ({ page }) => {
  await signIn(page, ADMIN, { next: '/partner' });
  await a11y(page);
  await page.getByRole('link', { name: /Police/ }).first().click();
  await expect(page.getByLabel('Type of record')).toBeVisible();
  await a11y(page);
  await page.getByLabel('Number plate').fill('UBJ 214K');
  await page.getByLabel('Type of record').selectOption('stolen_reported');
  await page.getByLabel('Date it happened').fill('2026-09-30');
  await shot(page, 'partner-one');
  await page.getByRole('button', { name: 'Send record' }).click();
  await expect(page.getByRole('status')).toContainText('Received and added to the vehicle');

  await page.getByRole('status').getByRole('link').click();
  await expect(page.getByText('There is an open stolen-vehicle report for this car.').first()).toBeVisible();
});

test('a CSV file: good rows are added, bad rows explained, re-sending makes no duplicates', async ({ page }) => {
  await signIn(page, ADMIN, { next: '/partner' });
  await page.getByRole('link', { name: /Bank \/ lender/ }).first().click();
  await page.getByRole('link', { name: 'Upload a file' }).click();
  const tpl = await page.request.get(await page.getByRole('link', { name: /Download the template/ }).getAttribute('href') as string);
  expect(await tpl.text()).toMatch(/^vin,chassis_number,plate,record_type,date/);

  const csv = [
    'vin,chassis_number,plate,record_type,date',
    ',,UBJ 214K,finance_lien_registered,2026-08-01',
    ',,UBJ 214K,odometer_reading,2026-08-01',
    ',,,finance_lien_discharged,2026-08-02',
    ',,UBJ 214K,finance_lien_discharged,not-a-date',
  ].join('\n');
  const upload = async () => {
    await page.getByLabel('CSV file').setInputFiles({ name: 'liens.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByRole('status', { name: 'Upload result' })).toContainText('liens.csv: 4 rows');
  };
  await upload();
  const firstSubmission = await page.getByRole('link', { name: 'submission 1' }).getAttribute('href');
  const result = page.getByRole('status', { name: 'Upload result' });
  await expect(result).toContainText('1 added');
  await expect(result).toContainText('3 not sent');
  await expect(result).toContainText('This source cannot send "odometer_reading"');
  await expect(result).toContainText('Give a VIN, chassis number or plate');
  await expect(result).toContainText('Date must look like 2024-06-14');
  await shot(page, 'partner-csv');

  // The same file again: SAZO recognises it and returns the same submission instead of adding the lien twice.
  await page.reload();
  await upload();
  expect(await page.getByRole('link', { name: 'submission 1' }).getAttribute('href')).toBe(firstSubmission);
});

test('P-05 and P-09: correct a record, withdraw one with a reason, and look up a car', async ({ page }) => {
  await signIn(page, ADMIN, { next: '/partner' });
  await page.getByRole('link', { name: /Bank \/ lender/ }).first().click();
  await page.getByLabel('Number plate').fill('UBJ 214K');
  await page.getByLabel('Type of record').selectOption('finance_lien_registered');
  await page.getByLabel('Date it happened').fill('2026-09-01');
  await page.getByRole('button', { name: 'Send record' }).click();
  await expect(page.getByRole('status')).toContainText('Received and added to the vehicle');

  // Correct it: a new record replaces it; the old one stays, marked corrected.
  await page.goto(page.url().split('?')[0]!);
  await page.getByRole('link', { name: 'Correct or withdraw' }).click();
  const sent = page.locator('section[aria-labelledby="sent"] li');
  await expect(sent.first()).toContainText('Finance registered');
  await expect(sent.first()).toContainText('Counts');
  await a11y(page);
  await sent.first().getByRole('link', { name: 'Correct' }).click();
  await expect(page.getByText('Correcting a record for this car')).toBeVisible();
  await expect(page.getByLabel('Date it happened')).toHaveValue('2026-09-01');
  await page.getByLabel('Date it happened').fill('2026-09-02');
  await page.getByRole('button', { name: 'Send correction' }).click();
  await expect(page.getByRole('status')).toContainText('Received and added to the vehicle');
  await expect(page.getByText('marked corrected, and no longer counts')).toBeVisible();
  await page.getByRole('link', { name: 'Back to records sent' }).click();
  await expect(sent.first()).toContainText('a correction');
  await expect(sent.nth(1)).toContainText('Corrected');
  await shot(page, 'partner-records');

  // Withdraw the correction with a reason.
  await sent.first().getByRole('link', { name: 'Withdraw' }).click();
  await page.getByLabel(/Why are you withdrawing it/).fill('Sent for the wrong car');
  await page.getByRole('button', { name: 'Withdraw record' }).click();
  await expect(page.getByRole('status')).toContainText('Withdrawn.');
  await page.getByRole('link', { name: 'Back to records sent' }).click();
  await expect(sent.first()).toContainText('Withdrawn');
  await expect(sent.first()).toContainText('Reason: Sent for the wrong car');
  await expect(sent.first().getByRole('link', { name: 'Correct' })).toHaveCount(0);

  // Look up a car before acting on it.
  await page.getByRole('link', { name: 'Look up a car' }).click();
  await page.getByLabel('Plate, VIN or chassis number').fill('UBJ 214K');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.locator('a[href^="/v/SZV-"]').first()).toBeVisible();
  await a11y(page);
});
