// "My cars" (O-007): the registry knows the owner's phone → instant match; anyone else sends a logbook photo
// that a SAZO reviewer approves or rejects. Owners confirm garage visits made while the car was theirs.
import { expect, test } from '@playwright/test';
import { a11y, createAdmin, shot, signIn } from './helpers';

const stamp = String(Date.now()).slice(-5);
const ADMIN = `+2567081${stamp}`;
const OWNER = `+2567712${stamp}`;
const OTHER = `+2567713${stamp}`;

test.beforeAll(() => createAdmin(ADMIN, 'Rita (reviewer)'));

test('phone match, garage visits, and a logbook claim a reviewer rejects', async ({ browser }) => {
  // The registry records a change of owner with the new owner's phone (entered through the partner console).
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/partner' });
  await admin.getByRole('link', { name: /Vehicle registry/ }).first().click();
  await admin.getByLabel('Number plate').fill('UBE 260R');
  await admin.getByLabel('Type of record').selectOption('ownership_transferred');
  await admin.getByLabel('Date it happened').fill('2023-01-01');
  await admin.getByLabel(/Registered owner phone/).fill(OWNER);
  await admin.getByRole('button', { name: 'Send record' }).click();
  await expect(admin.getByRole('status')).toContainText('Received and added to the vehicle');

  // The owner: phone matches → confirmed at once.
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, OWNER, { name: 'Grace Owner', next: '/check?q=UBE%20260R' });
  await expect(owner).toHaveURL(/\/v\/SZV-/);
  const report = owner.url();
  await owner.getByRole('button', { name: 'This is my car' }).click();
  await expect(owner).toHaveURL(/\/my-cars/);
  await expect(owner.getByRole('status')).toContainText('Your phone number matches the registry record');
  await expect(owner.getByText('Confirmed owner')).toBeVisible();
  await a11y(owner);

  // Garage visits: older ones were before the car was theirs; newer ones can be confirmed once.
  await owner.getByRole('link', { name: 'Garage visits' }).click();
  await expect(owner.getByRole('heading', { name: 'Garage visits' })).toBeVisible();
  await expect(owner.getByText('Before the car was yours.').first()).toBeVisible();
  await a11y(owner);
  await shot(owner, 'my-car-visits');
  const answerable = owner.getByRole('button', { name: 'Yes, this happened' });
  const before = await answerable.count();
  expect(before).toBeGreaterThan(0);
  await answerable.first().click();
  await expect(owner.getByRole('status')).toContainText('visit confirmed');
  await expect(owner.getByText('You confirmed this visit')).toBeVisible();
  await expect(answerable).toHaveCount(before - 1);

  // Back on the report, the button now says it is theirs.
  await owner.goto(report);
  await expect(owner.getByRole('link', { name: 'Your car' })).toBeVisible();

  // Someone else: no phone match → logbook photo → waiting for SAZO.
  const other = await (await browser.newContext()).newPage();
  await signIn(other, OTHER, { name: 'Brian Claimant', next: new URL(report).pathname });
  await other.getByRole('button', { name: 'This is my car' }).click();
  await expect(other.getByRole('heading', { name: 'Show this is your car' })).toBeVisible();
  await a11y(other);
  await other.getByLabel(/Photo of the logbook/).setInputFiles({ name: 'logbook.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]) });
  await other.getByRole('button', { name: 'Send to SAZO' }).click();
  await expect(other.getByRole('status')).toContainText('Logbook sent');
  await expect(other.getByText('Logbook being checked')).toBeVisible();

  // The reviewer sees the photo and rejects with a reason.
  await admin.goto('/admin/ownership');
  const claim = admin.getByRole('listitem').filter({ hasText: 'Brian Claimant' });
  await expect(claim).toBeVisible();
  await a11y(admin);
  const photo = await admin.request.get(await claim.getByRole('link', { name: 'photo 1' }).getAttribute('href') as string);
  expect(photo.headers()['content-type']).toBe('image/jpeg');
  await claim.getByLabel(/Reason/).fill('The name on the logbook is not yours');
  await claim.getByRole('button', { name: 'Reject' }).click();
  await expect(admin.getByRole('status')).toContainText('Rejected');

  await other.reload();
  await expect(other.getByText('Not confirmed')).toBeVisible();
  await expect(other.getByText('The name on the logbook is not yours')).toBeVisible();
});
