// A garage owner registers on the website, sends a document, answers SAZO's question, and is approved.
import { expect, test } from '@playwright/test';
import { a11y, createAdmin, shot, signIn, testPhoto } from './helpers';

const stamp = String(Date.now()).slice(-7);
const OWNER = `+2567060${stamp}`;
const ADMIN = `+2567070${stamp}`;
const NAME = `Nakawa Auto Repairs ${stamp}`;
const PDF = Buffer.from('%PDF-1.4\n% SAZO e2e trading licence\n');

test.beforeAll(() => createAdmin(ADMIN, 'Ruth (SAZO reviewer)'));

test('register a garage, send documents, get approved', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await owner.goto('/business');
  await a11y(owner);
  await owner.getByRole('link', { name: 'Register your business' }).first().click();
  await expect(owner).toHaveURL(/sign-in/);
  await signIn(owner, OWNER, { name: 'Joseph Owner', next: '/business/register' });

  await expect(owner.getByRole('heading', { name: 'Register your business' })).toBeVisible();
  await a11y(owner);
  await owner.getByLabel('Registered business name *').fill(`${NAME} Ltd`);
  await owner.getByLabel('Name customers know you by').fill(NAME);
  await owner.getByLabel('District').fill('Kampala');
  await owner.getByRole('button', { name: 'Register business' }).click();
  await expect(owner.getByText(`${NAME} is registered`)).toBeVisible();
  await expect(owner.getByText('SAZO is checking')).toBeVisible();
  await expect(owner).toHaveURL(/\/business\/[0-9a-f-]{36}/);
  await expect(owner.getByRole('contentinfo')).toHaveCount(0); // a business's own pages have no site footer

  await owner.getByLabel('Files').setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: PDF });
  await owner.getByRole('button', { name: 'Send to SAZO' }).click();
  await expect(owner.getByRole('status')).toContainText('1 document sent to SAZO');
  // A-05: the manager's National ID, checked by SAZO together with the business.
  await owner.getByLabel('National ID number (NIN)').fill('cm 9000 1234 abcd'.replace('abcd', String(stamp).slice(-4).padStart(4, '0')));
  await owner.getByLabel('Photo of your National ID').setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: testPhoto(`owner id ${stamp}`) });
  await owner.getByRole('button', { name: 'Send my ID' }).click();
  await expect(owner.getByRole('status')).toContainText('Your National ID was sent');
  await shot(owner, 'business-status');

  // SAZO looks at the document and asks for more.
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin/organisations' });
  await admin.getByRole('listitem').filter({ hasText: NAME }).getByRole('link').click();
  const card = admin.getByRole('region', { name: 'Details' });
  const docLink = card.getByRole('link', { name: 'document 1' });
  await expect(docLink).toBeVisible();
  const file = await admin.request.get(await docLink.getAttribute('href') as string);
  expect(file.headers()['content-type']).toContain('application/pdf');
  await card.getByLabel(/Reason/).fill('Please send a photo of your signboard');
  await card.getByRole('button', { name: 'Ask for more' }).click();
  await expect(admin.getByRole('status')).toContainText('Decision recorded');

  await owner.reload();
  await expect(owner.getByText('SAZO needs more from you')).toBeVisible();
  await expect(owner.getByText('“Please send a photo of your signboard”')).toBeVisible();

  // Approved.
  await admin.goto('/admin/organisations');
  await admin.getByRole('listitem').filter({ hasText: NAME }).getByRole('link').click();
  const again = admin.getByRole('region', { name: 'Details' });
  await expect(again).toContainText('ID sent: check it before approving');
  await expect(again.getByRole('link', { name: 'ID photo' })).toBeVisible();
  await again.getByLabel(/Reason/).fill('Signboard photo matches; licence valid');
  await again.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByRole('status')).toContainText('approve');

  await owner.reload();
  await expect(owner.getByRole('heading', { name: /You.re ready/ })).toBeVisible();
  await expect(owner.getByRole('link', { name: 'Open the Garage app' })).toBeVisible();

  // Signed in, the business page points to their businesses instead of sign-in.
  await owner.goto('/business');
  await expect(owner.getByRole('link', { name: 'Your businesses' })).toBeVisible();

  // Coming back on another device: "Already registered?" leads to sign-in, then to the account.
  const later = await (await browser.newContext()).newPage();
  await later.goto('/business');
  await expect(later.getByRole('heading', { name: 'Already registered?' })).toBeVisible();
  await later.getByRole('main').getByRole('link', { name: 'Log in' }).click();
  await expect(later).toHaveURL(/sign-in\?next=%2Faccount|sign-in\?next=\/account/);
  await signIn(later, OWNER, { next: '/account' });
  await expect(later.getByRole('heading', { name: 'Owner Joseph' })).toBeVisible();

  // "Download my data" opens a readable page that includes the business; the JSON file is still offered.
  await later.getByRole('link', { name: 'Download my data' }).click();
  await expect(later.getByRole('heading', { name: 'Your data held by SAZO' })).toBeVisible();
  const biz = later.getByRole('region', { name: 'Your businesses' });
  await expect(biz).toContainText(NAME);
  await expect(biz).toContainText('Approved');
  await expect(biz).toContainText('Manager');
  await expect(biz).toContainText('Kampala');
  await expect(later.getByRole('button', { name: 'Save as PDF' })).toBeVisible();
  await a11y(later);
  await shot(later, 'my-data');
});
