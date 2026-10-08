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
