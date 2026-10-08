// Account settings: rename, move to a new phone number, stop visit texts, download my data, delete the account.
import { expect, test } from '@playwright/test';
import { a11y, codesSoFar, lastCode, shot, signIn } from './helpers';

const stamp = String(Date.now()).slice(-6);
const PHONE = `+256772${stamp}`;
const NEW_PHONE = `+256773${stamp}`;

test('manage my account and delete it', async ({ page }) => {
  await signIn(page, PHONE, { name: 'Ruth Akello', next: '/account' });
  await expect(page.getByRole('heading', { name: 'Hello, Ruth Akello' })).toBeVisible();
  await a11y(page);

  await page.getByLabel('Your name').fill('Ruth Akello Nambi');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('status')).toContainText('Name changed');
  await expect(page.getByRole('heading', { name: 'Hello, Ruth Akello Nambi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ruth Akello Nambi' })).toBeVisible();

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
  expect(await file.json()).toMatchObject({ profile: { displayName: 'Ruth Akello Nambi', phone: NEW_PHONE }, preferences: { visitConfirmationTexts: false } });

  await page.getByText('Delete my account').first().click();
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Type DELETE in capitals to confirm.')).toBeVisible();
  await page.getByText('Delete my account').first().click();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Your account has been deleted.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});
