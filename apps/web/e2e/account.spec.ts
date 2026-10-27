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
  await page.getByLabel('Given name').fill('ruth');
  await page.getByLabel('Middle name').fill('nambi');
  await page.getByRole('button', { name: 'Save names' }).click();
  await expect(page.getByRole('status')).toContainText('Names saved');
  await expect(page.getByRole('heading', { name: 'Akello N. Ruth' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Your details, Akello N. Ruth' })).toContainText('AR');
  // The account opens in a popup over the page, not on a new page.
  await page.getByRole('button', { name: 'Your details, Akello N. Ruth' }).click();
  const popup = page.getByRole('dialog', { name: 'Your details' });
  await expect(popup).toContainText('Akello Ruth Nambi');
  await expect(popup).toContainText('Phone');
  await expect(popup.getByRole('link')).toHaveCount(0); // details and Sign out only: no links
  await expect(popup.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await a11y(page);
  await popup.getByRole('button', { name: 'Close' }).click();
  await expect(popup).toBeHidden();

  // Settings open inside the page she is on, from My SAZO; a change keeps her there; Close returns to the page.
  await page.goto('/saved');
  await page.getByRole('button', { name: 'My SAZO' }).click();
  await page.getByRole('group', { name: 'My SAZO' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/saved\?panel=settings/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.getByLabel('Middle name').fill('Nambi');
  await page.getByRole('button', { name: 'Save names' }).click();
  await expect(page.getByRole('status')).toContainText('Names saved');
  await expect(page).toHaveURL(/\/saved\?.*panel=settings/);
  await a11y(page);
  await page.getByRole('link', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeHidden();
  await page.goto('/account');

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

  // Your data held by SAZO: a page to read, downloaded as PDF or Excel; never as JSON (D-147).
  await page.goto('/account/data');
  await expect(page.getByRole('heading', { name: 'Your data held by SAZO' })).toBeVisible();
  await expect(page.getByText(/JSON/)).toHaveCount(0);
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download PDF' }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^sazo-my-data-\d{4}-\d{2}-\d{2}\.pdf$/);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download Excel' }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^sazo-my-data-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect((await page.request.get('/account/export')).status()).toBe(404);
  await page.goto('/account');

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
  await panel.getByLabel('Surname').fill('anguzu');
  await panel.getByLabel('Given name').fill('MIKE');
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
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Welcome to SAZO, Mike' })).toBeVisible();
  await a11y(page);
  await expect(page.getByRole('button', { name: 'Your details, Anguzu J. Mike' })).toContainText('AM');
  await shot(page, 'signed-up');

  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out here' }).click();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  await page.goto('/sign-in?next=/account');
  await a11y(page);
  await shot(page, 'log-in');
  const login = page.getByRole('main');
  await login.getByLabel('Email', { exact: true }).fill('nobody@example.com');
  await login.getByLabel('Password', { exact: true }).fill('whatever-1234');
  await login.getByRole('button', { name: 'Log in to SAZO' }).click();
  await expect(login.getByText('No SAZO account uses this email.')).toBeVisible();
  await login.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
  await login.getByLabel('Password', { exact: true }).fill('river-stone-7');
  let before = codesSoFar();
  await login.getByRole('button', { name: 'Log in to SAZO' }).click();
  // A new device: a code by email, since he has no phone yet (D-145).
  await expect(page.getByRole('heading', { name: /Confirm it.s you/ })).toBeVisible();
  await expect(page.getByText('We sent a code by email to')).toBeVisible();
  await a11y(page);
  await shot(page, 'second-step');
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByRole('button', { name: 'Confirm' }).click();
  // No phone on the account: he adds one before going in.
  await expect(page.getByRole('heading', { name: 'Add your phone' })).toBeVisible();
  await a11y(page);
  await shot(page, 'add-phone');
  await page.getByLabel('Mobile number').fill(`0774${stamp}`);
  before = codesSoFar();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByRole('button', { name: 'Confirm and carry on' }).click();
  await expect(page.getByRole('heading', { name: 'Anguzu J. Mike' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Your profile' })).toHaveAttribute('aria-valuenow', '75');

  // Forgot password: the emailed link, then a code to the phone just added.
  await page.getByRole('button', { name: 'Sign out here' }).click();
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /Send/ }).click();
  await expect.poll(() => { try { return emailLink(email); } catch { return ''; } }).toContain('/reset-password?token=');
  await page.goto(new URL(emailLink(email)).pathname + new URL(emailLink(email)).search);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  before = codesSoFar();
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByText(/We sent a code to \+256/)).toBeVisible();
  await a11y(page);
  await shot(page, 'reset-password');
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  await page.getByLabel('6-digit code').fill(lastCode());
  await page.getByLabel('New password', { exact: true }).fill('lake-victoria-22');
  await page.getByLabel('New password again').fill('lake-victoria-22');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your password has been changed. Log in with the new one.')).toBeVisible();
});
