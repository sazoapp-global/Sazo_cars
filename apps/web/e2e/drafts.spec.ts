// What people type is kept in their browser tab (25 Oct 2026): after a refresh, after switching between phone
// and email sign-up, and after a failed send. Passwords are never kept, and the draft goes once the account exists.
import { expect, test } from '@playwright/test';

const stamp = String(Date.now()).slice(-6);

test('sign-up keeps what was typed through a switch, a refresh and a failed send', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Surname').fill('Nakato');
  await page.getByLabel('Given name').fill('Grace');
  await page.getByText('Female', { exact: true }).click();
  await page.getByLabel('Date of birth').fill('1992-03-14');

  // Email is the first way; switching to phone and back keeps the details.
  await page.getByRole('button', { name: 'Use phone number' }).click();
  await expect(page.getByLabel('Mobile number')).toBeVisible();
  await page.getByRole('button', { name: 'Use email instead' }).click();
  await expect(page.getByLabel('Surname')).toHaveValue('Nakato');
  await expect(page.getByLabel('Given name')).toHaveValue('Grace');
  await expect(page.getByLabel('Date of birth')).toHaveValue('1992-03-14');
  await expect(page.getByRole('radio', { name: 'Female' })).toBeChecked();

  const email = `grace.${stamp}@example.com`;
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('river-stone-7a');
  await page.getByLabel('Mobile number').fill(`0775${stamp}`);

  // A refresh keeps everything except the password.
  await page.reload();
  await expect(page.getByLabel('Surname')).toHaveValue('Nakato');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');

  // A failed send (passwords differ) keeps the details too.
  await page.getByLabel('Password', { exact: true }).fill('river-stone-7a');
  await page.getByLabel('Password again').fill('something-else-9');
  await page.getByRole('button', { name: /Create Free Account/ }).click();
  await expect(page.getByText('The two passwords are different.')).toBeVisible();
  await expect(page.getByLabel('Surname')).toHaveValue('Nakato');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);

  // Once the account is made, the draft is gone.
  await page.getByLabel('Password', { exact: true }).fill('river-stone-7a');
  await page.getByLabel('Password again').fill('river-stone-7a');
  await page.getByRole('button', { name: /Create Free Account/ }).click();
  await expect(page.getByLabel('6-digit code')).toBeVisible();
  await page.getByRole('button', { name: 'Do it later' }).click();
  await expect(page).toHaveURL(/\/welcome/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('sazo-draft:')))).toEqual([]);
});
