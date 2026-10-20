// SAZO staff work their queues in the browser: approve a garage, settle a cloned plate, see the sources.
// Expects a freshly seeded database (CI makes one), because settling the plate changes data.
import { expect, test } from '@playwright/test';
import { API, a11y, apiToken, createAdmin, shot, signIn as signInAs, sendIdentity } from './helpers';

const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567030${stamp}`;
const signIn = (page: import('@playwright/test').Page, phone: string, name?: string) => signInAs(page, phone, { name, next: '/admin' });

test.beforeAll(() => createAdmin(ADMIN, 'Grace (SAZO admin)'));

test('people who are not SAZO staff cannot open the console', async ({ page }) => {
  await signIn(page, `+2567040${stamp}`, 'Just A Buyer');
  await expect(page).toHaveURL(/\/admin\/no-access/);
  await expect(page.getByRole('heading', { name: 'SAZO staff only' })).toBeVisible();
});

test("only an administrator downloads a person's data as a JSON file", async ({ page }) => {
  await signIn(page, ADMIN);
  await page.getByRole('navigation', { name: 'Admin' }).getByText('Accounts').click();
  await page.getByRole('link', { name: "People's data" }).click();
  await expect(page.getByRole('heading', { name: "People's data" })).toBeVisible();
  await a11y(page);
  await page.getByLabel('Their mobile number').fill('0700 000 000');
  await page.getByRole('button', { name: 'Download JSON file' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No SAZO account uses this number.' })).toBeVisible();
  await page.getByLabel('Their mobile number').fill(`0${ADMIN.slice(4)}`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download JSON file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^sazo-person-data-\d{4}-\d{4}-\d{2}-\d{2}\.json$/);
});

test('approve a garage that registered', async ({ page, request }) => {
  // A garage manager registers through the API (their sign-up screen comes later).
  const phone = `+2567050${stamp}`;
  const t = await apiToken(request, phone, 'Musa Manager');
  await request.post(`${API}/organisations`, { headers: { Authorization: `Bearer ${t}` }, data: { type: 'garage', legalName: `Bugolobi Car Care ${stamp} Ltd`, district: 'Kampala' } });
  await sendIdentity(request, t, `musa ${stamp}`);

  await signIn(page, ADMIN);
  await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible();
  await shot(page, 'admin-home');
  await a11y(page);
  await page.getByRole('navigation', { name: 'Admin' }).getByText('Accounts').click();
  await page.getByRole('link', { name: 'Businesses', exact: true }).click();
  const card = page.getByRole('listitem').filter({ hasText: `Bugolobi Car Care ${stamp} Ltd` });
  await expect(card).toContainText('ID sent: check it before approving');
  // A manager's account opens in a popup over the list, with the ID photo.
  await card.getByRole('button', { name: /Account details for/ }).first().click();
  const person = page.getByRole('dialog');
  await expect(person).toContainText('National ID');
  await expect(person).toContainText(`Bugolobi Car Care ${stamp} Ltd`);
  await expect(person.getByRole('img', { name: /National ID photo/ })).toBeVisible();
  await a11y(page);
  await person.getByRole('button', { name: 'Close' }).click();
  await card.getByLabel(/Reason/).fill('Visited the workshop on Port Bell Road');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('status')).toContainText('Decision recorded: approve');
  await page.goto('/admin/organisations?status=approved');
  await expect(page.getByRole('heading', { name: `Bugolobi Car Care ${stamp} Ltd` })).toBeVisible();
});

test('settle a cloned plate: the genuine car keeps it', async ({ page, request }) => {
  const search = await (await request.get(`${API}/vehicles/search?q=UAX%20123A`)).json();
  test.skip(search.outcome !== 'multiple', 'already settled in this database — run against a fresh seed');
  const genuine = search.matches.find((m: { currentPlate: string }) => m.currentPlate === 'UAX 123A').vehicleRef as string;

  await signIn(page, ADMIN);
  await page.goto('/admin/conflicts?topic=identity');
  await a11y(page);
  await page.getByRole('row').filter({ hasText: genuine }).getByRole('link', { name: 'Review' }).first().click();
  await expect(page.getByText('Disputed plate on this vehicle')).toBeVisible();
  await shot(page, 'admin-conflict');
  await a11y(page);
  await page.getByLabel('What happened').fill('The Harrier is using a copied plate');
  await page.getByLabel('Why you think so').fill('Registry record and chassis number match the Premio');
  await page.getByRole('radio', { name: new RegExp(genuine) }).check();
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByRole('status')).toContainText('Resolved');

  await page.goto('/check?q=UAX%20123A');
  await expect(page).toHaveURL(new RegExp(`/v/${genuine}`));
});

test('data sources show which are simulated', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/admin/sources');
  await expect(page.getByText('Simulated').first()).toBeVisible();
  await a11y(page);
});

test('announcements reach the bell and help answers reach the Help page (A-06, A-07)', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, ADMIN);
  await page.getByRole('navigation', { name: 'Admin' }).getByText('Messages and content').click();
  await page.getByRole('link', { name: 'Announcements' }).click();
  await page.getByLabel('Who is it for?').selectOption('everyone');
  await page.getByLabel('Title').fill(`Testing week ${stamp}`);
  await page.getByLabel('Message').fill('Records on SAZO are simulated this week.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status')).toContainText('Announcement sent');
  await a11y(page);

  await page.getByRole('link', { name: 'Help answers' }).click();
  await page.getByText('Add a question').click();
  await page.getByLabel('Question').fill(`How do I check a car ${stamp}?`);
  await page.getByLabel('Topic').fill('Getting started');
  await page.getByLabel('Answer').fill('Type its number plate or VIN on the home page.');
  await page.getByLabel('Status').selectOption('published');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Added');
  await a11y(page);

  const buyer = await (await browser.newContext()).newPage();
  await signInAs(buyer, `+2567060${stamp}`, { name: 'Ruth Buyer' });
  await expect(buyer.getByRole('link', { name: /Notifications, \d+ new/ })).toBeVisible();
  await buyer.getByRole('link', { name: /Notifications/ }).click();
  await expect(buyer.getByRole('list', { name: 'Messages from SAZO' })).toContainText(`Testing week ${stamp}`);
  await a11y(buyer);
  await buyer.goto('/help');
  await buyer.getByText(`How do I check a car ${stamp}?`).click();
  await expect(buyer.getByText('Type its number plate or VIN on the home page.')).toBeVisible();
  await a11y(buyer);
});
