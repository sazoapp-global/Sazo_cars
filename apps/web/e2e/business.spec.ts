// A garage owner registers on the website, sends a document, answers SAZO's question, and is approved.
import { expect, test } from '@playwright/test';
import { a11y, createAdmin, shot, signIn } from './helpers';

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

  await owner.getByLabel('Files').setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: PDF });
  await owner.getByRole('button', { name: 'Send to SAZO' }).click();
  await expect(owner.getByRole('status')).toContainText('1 document sent to SAZO');
  await shot(owner, 'business-status');

  // SAZO looks at the document and asks for more.
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin/organisations' });
  const card = admin.getByRole('listitem').filter({ hasText: NAME });
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
  const again = admin.getByRole('listitem').filter({ hasText: NAME });
  await again.getByLabel(/Reason/).fill('Signboard photo matches; licence valid');
  await again.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByRole('status')).toContainText('approve');

  await owner.reload();
  await expect(owner.getByRole('heading', { name: /You.re ready/ })).toBeVisible();
  await expect(owner.getByRole('link', { name: 'Open the Garage app' })).toBeVisible();
});
