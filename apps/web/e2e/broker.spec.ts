// A broker (D-121, D-127): applies with a National ID, is approved by a SAZO admin, shares a dealer's car that
// is open to brokers, brings a customer through their own link, and sees the commission once the dealer
// completes the sale and approves it. The dealer sees who brought the customer.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { API_LOG } from '../playwright.config';
import { API, a11y, apiToken, createAdmin, shot, signIn, testPhoto, sendIdentity } from './helpers';

const stamp = String(Date.now()).slice(-7);
const BROKER = `+2567070${stamp}`;
const MANAGER = `+2567080${stamp}`;
const ADMIN = `+2567110${stamp}`;
const DEALER = `Nakawa Motors ${stamp}`;
const emailLink = (to: string) => [...readFileSync(API_LOG, 'utf8').matchAll(new RegExp(`Email to ${to.replace('.', '\\.')}:[\\s\\S]*?(http\\S+token=[A-Za-z0-9_-]+)`, 'g'))].at(-1)![1]!;

test.beforeAll(() => createAdmin(ADMIN, 'Ruth (SAZO admin)'));

test('a broker shares a dealer’s car, brings a customer and follows the commission', async ({ browser, request }) => {
  // The dealer, with a car open to brokers at a fixed commission (set up through the API).
  const manager = await apiToken(request, MANAGER, 'Joseph Manager');
  const adminToken = await apiToken(request, ADMIN);
  const as = { Authorization: `Bearer ${manager}` };
  const org = (await (await request.post(`${API}/organisations`, { headers: as, data: { type: 'dealer', legalName: `${DEALER} Ltd`, tradingName: DEALER } })).json()).id;
  await sendIdentity(request, manager, `dealer ${stamp}`);
  expect((await request.post(`${API}/admin/organisations/${org}/decision`, { headers: { Authorization: `Bearer ${adminToken}` }, data: { decision: 'approve', reason: 'Yard visited' } })).ok()).toBeTruthy();
  const dealerHeaders = { ...as, 'X-Organisation-Id': org };
  const car = await (await request.post(`${API}/dealer/stock`, { headers: dealerHeaders, data: { chassisNumber: `ZRR80-${stamp}`, askingPriceUgx: 52_000_000,
    details: { make: 'Toyota', model: 'Esquire', modelYear: 2016, commissionKind: 'fixed', commissionFixedUgx: 450_000 } } })).json();

  // The broker finishes their profile (email and password) and applies.
  const brokerToken = await apiToken(request, BROKER, 'Ivan Kato');
  const email = `ivan${stamp}@example.com`;
  await request.post(`${API}/me/email`, { headers: { Authorization: `Bearer ${brokerToken}` }, data: { email } });
  await expect.poll(() => { try { return emailLink(email); } catch { return ''; } }).toContain('token=');
  await request.post(`${API}/auth/email/verify`, { data: { token: emailLink(email).split('token=')[1] } });
  await request.put(`${API}/me/password`, { headers: { Authorization: `Bearer ${brokerToken}` }, data: { newPassword: `nakawa-market-${stamp}` } });

  const broker = await (await browser.newContext()).newPage();
  await signIn(broker, BROKER, { next: '/broker' });
  await expect(broker.getByRole('heading', { name: 'Become a broker' })).toBeVisible();
  await a11y(broker);
  await broker.getByLabel('National ID number (NIN)').fill(`CM${stamp}ABCDE`);
  await broker.getByLabel('Photo of your National ID').setInputFiles({ name: 'id.png', mimeType: 'image/png', buffer: testPhoto(`national id ${stamp}`) });
  await broker.getByRole('button', { name: 'Send for checking' }).click();
  await expect(broker.getByText('SAZO is checking your ID.')).toBeVisible();

  // A SAZO admin compares the ID number with the photo and approves.
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin/brokers' });
  await a11y(admin);
  await admin.getByRole('listitem').filter({ hasText: 'Kato Ivan' }).getByRole('link').click();
  const application = admin.getByRole('region', { name: 'Details' });
  await expect(application).toContainText(`CM${stamp}ABCDE`);
  await application.getByLabel('Reason').fill('ID number and photo match');
  await application.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByRole('status')).toContainText('Approved');

  // The broker sees the car with its commission, never the dealer's costs, and makes a WhatsApp link.
  // Once approved, the account has the broker role: logging in with no page in mind lands on the broker's pages (D-172).
  const again = await (await browser.newContext()).newPage();
  await signIn(again, BROKER);
  await expect(again).toHaveURL(/\/broker$/);
  await expect(again.getByRole('heading', { level: 1, name: 'Cars to share' })).toBeVisible();
  await again.context().close();

  await broker.goto('/broker');
  // Brokers have their own workspace (11 Nov 2026): the four parts are side bar items, each page with its title.
  await expect(broker.getByRole('heading', { level: 1, name: 'Cars to share' })).toBeVisible();
  // On a phone (as here) the side bar is the strip of links under the top bar.
  const menu = broker.getByRole('navigation', { name: 'Broker' });
  await expect(broker.getByText(/^Broker · /)).toBeVisible();
  for (const item of ['Cars to share', 'My links', 'My customers', 'My commission', 'Notifications']) await expect(menu.getByRole('link', { name: new RegExp(`^${item}`) })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Cars to share' })).toHaveAttribute('aria-current', 'page');
  const card = broker.getByRole('listitem').filter({ hasText: '2016 Toyota Esquire' }).filter({ hasText: DEALER });
  await expect(card).toContainText('UGX 450,000 commission');
  await a11y(broker);
  await shot(broker, 'broker-cars');
  await card.getByRole('button', { name: 'Make my link' }).click();
  await expect(broker.getByText('Your WhatsApp link is ready')).toBeVisible();
  const link = (await broker.locator('p.sazo-id').first().textContent())!;

  // A buyer opens the broker's page and asks about the car.
  const buyer = await (await browser.newContext()).newPage();
  await buyer.goto(link);
  await expect(buyer.getByText('Shared by Ivan Kato')).toBeVisible();
  await expect(buyer.getByText(DEALER)).toHaveCount(0);
  await buyer.getByLabel('Your name').fill('Sarah Nambi');
  await buyer.getByLabel('Phone number').fill(`0752 ${stamp.slice(-6, -3)} ${stamp.slice(-3)}`);
  await buyer.getByLabel(/I agree that the seller may contact me/).check();
  await buyer.getByRole('button', { name: 'Send' }).click();
  await expect(buyer.getByRole('status')).toContainText('Ivan Kato will contact you');

  await menu.getByRole('link', { name: 'My customers' }).click();
  await expect(broker.getByRole('heading', { level: 1, name: 'My customers' })).toBeVisible();
  await expect(broker.getByRole('listitem').filter({ hasText: 'Sarah Nambi' })).toContainText('Registered to you until');

  // Messages (D-173): the broker writes to the dealer about the car; the dealer's team reads and answers.
  await menu.getByRole('link', { name: /^Messages/ }).click();
  await expect(broker.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
  await broker.getByRole('navigation', { name: 'Conversations' }).getByRole('link', { name: new RegExp(DEALER) }).click();
  await broker.getByRole('button', { name: 'Add a car' }).click();
  await broker.getByRole('group', { name: /cars open to brokers/ }).getByRole('button', { name: /2016 Toyota Esquire/ }).click();
  await broker.getByLabel('Message', { exact: true }).fill('a customer of mine wants to see this one on Saturday. is that fine?');
  await broker.getByRole('button', { name: 'Send' }).click();
  const brokerThread = broker.getByRole('list', { name: 'Messages' });
  await expect(brokerThread.getByRole('listitem').last()).toContainText('A customer of mine wants to see this one on Saturday. Is that fine?');
  await expect(brokerThread.getByRole('listitem').last()).toContainText('2016 Toyota Esquire');
  await a11y(broker);

  const dealer = await (await browser.newContext()).newPage();
  await signIn(dealer, MANAGER, { next: `/dealer/${org}/messages` });
  await expect(dealer.getByRole('navigation', { name: 'Dealer' }).getByRole('link', { name: /^Messages/ })).toContainText('1');
  await dealer.getByRole('navigation', { name: 'Conversations' }).getByRole('link', { name: /Broker/ }).click();
  const dealerThread = dealer.getByRole('list', { name: 'Messages' });
  await expect(dealerThread).toContainText('Is that fine?');
  await expect(dealerThread.getByRole('listitem').last()).toContainText('· Broker');
  await dealer.getByLabel('Message', { exact: true }).fill('Yes, Saturday from 10 is fine.');
  await dealer.getByRole('button', { name: 'Send' }).click();
  await expect(dealerThread.getByRole('listitem').last()).toContainText('Yes, Saturday from 10 is fine.');
  await a11y(dealer);
  await shot(dealer, 'dealer-messages');
  await broker.reload();
  await expect(brokerThread.getByRole('listitem').last()).toContainText('Yes, Saturday from 10 is fine.');
  await expect(brokerThread.getByRole('listitem').last()).toContainText('· Manager');

  // The dealer sees who brought her, completes the sale and approves the commission.
  await dealer.goto(`/dealer/${org}/enquiries`);
  await dealer.getByRole('listitem').filter({ hasText: 'Sarah Nambi' }).getByRole('link').click();
  const lead = dealer.getByRole('region', { name: 'Enquiry from Sarah Nambi' });
  await expect(lead).toContainText('Brought by broker Ivan');
  await lead.getByText('Choose another stage').click();
  await lead.getByLabel('Move to').selectOption('completed');
  await lead.getByLabel(/Sold for \(UGX, only/).fill('51,000,000');
  await lead.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(dealer.getByRole('status')).toContainText('Sale recorded');
  await dealer.getByRole('link', { name: 'Commission' }).first().click();
  const crow = dealer.getByRole('listitem').filter({ hasText: 'Ivan' });
  await expect(crow).toContainText('UGX 450,000');
  await a11y(dealer);
  await crow.getByRole('link').click();
  await dealer.getByRole('region', { name: /Commission for Ivan/ }).getByRole('button', { name: 'Approve' }).click();
  await expect(dealer.getByRole('status')).toContainText('Commission approved');
  await shot(dealer, 'dealer-commission');

  await broker.goto('/broker?tab=commissions');
  await expect(broker.getByRole('listitem').filter({ hasText: '2016 Toyota Esquire' })).toContainText('Approved, not paid yet');
  await a11y(broker);
  await shot(broker, 'broker-statement');
  void car;
});
