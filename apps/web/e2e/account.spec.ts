// Account settings: rename, move to a new phone number, stop visit texts, download my data, delete the account.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { API_LOG } from '../playwright.config';
import { a11y, codesSoFar, lastCode, shot, signIn } from './helpers';

/** The link in the latest email to an address (emails are printed in the API log on a developer's computer). */
const emailLink = (to: string) => [...readFileSync(API_LOG, 'utf8').matchAll(new RegExp(`Email to ${to.replace('.', '\\.')}:[\\s\\S]*?(http\\S+token=[A-Za-z0-9_-]+)`, 'g'))].at(-1)![1]!;

const stamp = String(Date.now()).slice(-6);
const PHONE = `+256772${stamp}`;
const NEW_PHONE = `+256773${stamp}`;

test('manage my account and delete it', async ({ page }) => {
  await signIn(page, PHONE, { name: 'Ruth Akello', next: '/account' });
  await expect(page.getByRole('heading', { name: 'Akello Ruth' })).toBeVisible();
  // Signed up by phone: details and phone done, email and password still to add (D-102).
  await expect(page.getByRole('progressbar', { name: 'Your profile' })).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByRole('link', { name: 'Add: confirmed email' })).toBeVisible();
  await a11y(page);

  // Names are tidied and shown surname first, with the middle initial; the circle shows "AR" (D-103).
  await page.getByLabel('Surname').fill('AKELLO');
  await page.getByLabel('First name').fill('ruth');
  await page.getByLabel('Middle name').fill('nambi');
  await page.getByRole('button', { name: 'Save names' }).click();
  await expect(page.getByRole('status')).toContainText('Names saved');
  await expect(page.getByRole('heading', { name: 'Akello N. Ruth' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings — Akello N. Ruth' })).toContainText('AR');

  // Add an email (confirmed by link) and a password: 100%, and she can log in with them.
  const email = `ruth${stamp}@example.com`;
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send a confirmation link' }).click();
  await expect(page.getByRole('status')).toContainText(`We sent a link to ${email}`);
  await expect(page.getByText('Waiting for you to open the link')).toBeVisible();
  await page.goto(emailLink(email).replace(/^https?:\/\/[^/]+/, ''));
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('papyrus-boat-4');
  await page.getByLabel('New password again').fill('papyrus-boat-4');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByRole('status')).toContainText('Password saved');
  await expect(page.getByRole('progressbar', { name: 'Your profile' })).toHaveAttribute('aria-valuenow', '100');

  // New number: the code goes to the new phone.
  await page.getByText('Change phone number').click();
  await page.getByLabel('New phone number').fill(`0${NEW_PHONE.slice(4)}`);
  const before = codesSoFar();
  await page.getByRole('button', { name: 'Send a code' }).click();
  await expect(page.getByLabel(/Code we sent to/)).toBeVisible();
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel(/Code we sent to/).fill(lastCode());
  await page.getByRole('button', { name: 'Use this number' }).click();
  await expect(page.getByRole('status')).toContainText('Your account now uses your new number');
  await expect(page.getByText(`0${NEW_PHONE.slice(4, 7)} ${NEW_PHONE.slice(7, 10)} ${NEW_PHONE.slice(10)}`)).toBeVisible();

  await page.getByLabel(/Ask me to confirm garage visits/).uncheck();
  await page.getByRole('region', { name: 'Texts' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toContainText('You will not get texts');
  await expect(page.getByLabel(/Ask me to confirm garage visits/)).not.toBeChecked();
  await expect(page.getByRole('listitem').filter({ hasText: 'This device' })).toContainText('Chrome on Android');
  await a11y(page);
  await shot(page, 'account');

  const file = await page.request.get('/account/export');
  expect(file.headers()['content-disposition']).toMatch(/attachment; filename="sazo-my-data-/);
  expect(await file.json()).toMatchObject({ profile: { displayName: 'Akello N. Ruth', phone: NEW_PHONE }, preferences: { visitConfirmationTexts: false } });

  await page.getByText('Delete my account').first().click();
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Type DELETE in capitals to confirm.')).toBeVisible();
  await page.getByText('Delete my account').first().click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Your account has been deleted.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
});

test('create an account with email and password, then log in with it (D-100)', async ({ page }) => {
  const email = `mike${stamp}@example.com`;
  await page.goto('/sign-up');
  await a11y(page);
  await shot(page, 'sign-up');
  const panel = page.getByRole('main');
  await panel.getByRole('button', { name: 'Use email instead' }).click();
  await panel.getByLabel('Surname').fill('anguzu');
  await panel.getByLabel('First name').fill('MIKE');
  await panel.getByLabel('Middle name').fill('james');
  await panel.getByLabel('Male', { exact: true }).check();
  // Under 18: refused with a clear reason.
  await panel.getByLabel('Date of birth').fill(`${new Date().getFullYear() - 16}-01-10`);
  await panel.getByLabel('Email', { exact: true }).fill(email);
  await panel.getByLabel('Password', { exact: true }).fill('river-stone-7');
  await panel.getByLabel('Password again').fill('river-stone-7');
  await panel.getByRole('button', { name: 'Create Free Account' }).click();
  await expect(panel.getByText('You must be 18 or older to use SAZO')).toBeVisible();
  await panel.getByLabel('Date of birth').fill('1991-04-20');
  await panel.getByLabel('Password', { exact: true }).fill('river-stone-7');
  await panel.getByLabel('Password again').fill('river-stone-7');
  await panel.getByRole('button', { name: 'Create Free Account' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Settings — Anguzu J. Mike' })).toContainText('AM');
  await shot(page, 'signed-up');

  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out here' }).click();
  await page.goto('/sign-in?next=/account');
  await a11y(page);
  await shot(page, 'log-in');
  const login = page.getByRole('main');
  await login.getByRole('button', { name: 'Use email instead' }).click();
  await login.getByLabel('Email', { exact: true }).fill('nobody@example.com');
  await login.getByLabel('Password', { exact: true }).fill('whatever-1234');
  await login.getByRole('button', { name: 'Log in to SAZO' }).click();
  await expect(login.getByText('No SAZO account uses this email.')).toBeVisible();
  await login.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
  await login.getByLabel('Password', { exact: true }).fill('river-stone-7');
  await login.getByRole('button', { name: 'Log in to SAZO' }).click();
  await expect(page.getByRole('heading', { name: 'Anguzu J. Mike' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Your profile' })).toHaveAttribute('aria-valuenow', '50');
});
