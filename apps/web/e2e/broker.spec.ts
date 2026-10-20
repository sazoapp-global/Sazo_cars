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
  const application = admin.getByRole('listitem').filter({ hasText: `CM${stamp}ABCDE` });
  await expect(application).toContainText('Kato Ivan');
  await a11y(admin);
  await application.getByLabel('Reason').fill('ID number and photo match');
  await application.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByRole('status')).toContainText('Approved');

  // The broker sees the car with its commission, never the dealer's costs, and makes a WhatsApp link.
  await broker.goto('/broker');
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

  await broker.getByRole('link', { name: 'My customers' }).click();
  await expect(broker.getByRole('listitem').filter({ hasText: 'Sarah Nambi' })).toContainText('Registered to you until');

  // The dealer sees who brought her, completes the sale and approves the commission.
  const dealer = await (await browser.newContext()).newPage();
  await signIn(dealer, MANAGER, { next: `/dealer/${org}/enquiries` });
  const lead = dealer.getByRole('listitem').filter({ hasText: 'Sarah Nambi' });
  await expect(lead).toContainText('Brought by broker Ivan');
  await lead.getByLabel('Move to').selectOption('completed');
  await lead.getByLabel(/Sold for/).fill('51,000,000');
  await lead.getByRole('button', { name: 'Move' }).click();
  await expect(dealer.getByRole('status')).toContainText('Sale recorded');
  await dealer.getByRole('link', { name: 'Commission' }).first().click();
  const row = dealer.getByRole('listitem').filter({ hasText: 'Ivan' });
  await expect(row).toContainText('UGX 450,000');
  await a11y(dealer);
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(dealer.getByRole('status')).toContainText('Commission approved');
  await shot(dealer, 'dealer-commission');

  await broker.goto('/broker?tab=commissions');
  await expect(broker.getByRole('listitem').filter({ hasText: '2016 Toyota Esquire' })).toContainText('Approved, not paid yet');
  await a11y(broker);
  await shot(broker, 'broker-statement');
  void car;
});
