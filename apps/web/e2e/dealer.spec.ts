// A car dealer registers, is approved, lists a known car and a car new to SAZO, changes a price, sends a
// buyer a report link, records a sale (price kept private) and adds a salesperson.
import { expect, test } from '@playwright/test';
import { a11y, createAdmin, shot, signIn } from './helpers';

const stamp = String(Date.now()).slice(-7);
const OWNER = `+2567090${stamp}`;
const ADMIN = `+2567100${stamp}`;
const NAME = `Kisementi Car Bond ${stamp}`;

test.beforeAll(() => createAdmin(ADMIN, 'Ruth (SAZO reviewer)'));

test('list cars, share a buyer link, record a sale', async ({ browser }) => {
  const dealer = await (await browser.newContext()).newPage();
  await signIn(dealer, OWNER, { name: 'Moses Dealer', next: '/business/register' });
  await dealer.getByLabel(/Car dealer/).check();
  await dealer.getByLabel('Registered business name *').fill(`${NAME} Ltd`);
  await dealer.getByLabel('Name customers know you by').fill(NAME);
  await dealer.getByRole('button', { name: 'Register business' }).click();
  await expect(dealer.getByText(`${NAME} is registered`)).toBeVisible();
  const businessUrl = dealer.url();

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin/organisations' });
  const card = admin.getByRole('listitem').filter({ hasText: NAME });
  await card.getByLabel(/Reason/).fill('Yard visited; trading licence valid');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByRole('status')).toContainText('approve');

  await dealer.goto(businessUrl);
  await dealer.getByRole('link', { name: 'Open your stock' }).click();
  await expect(dealer.getByRole('heading', { name: `${NAME} — cars for sale` })).toBeVisible();
  await a11y(dealer);

  // A known car, by plate.
  await dealer.getByLabel('Number plate').fill('uba 905t');
  await dealer.getByLabel('Asking price (UGX) *').fill('25,500,000');
  await dealer.getByLabel('Mileage now (km)').fill('150000');
  await dealer.getByRole('button', { name: 'Add to stock' }).click();
  await expect(dealer.getByRole('status')).toContainText('Added to your stock');
  const car = dealer.getByRole('listitem').filter({ hasText: 'UBA 905T' });
  await expect(car).toContainText('UGX 25.5M');
  await expect(car.getByRole('list', { name: 'What the records show' })).toBeVisible();

  // A car SAZO does not know: the plate alone is not enough.
  await dealer.getByText('Add a car').click();
  await dealer.getByLabel('Number plate').fill('UBX 777Q');
  await dealer.getByLabel('Asking price (UGX) *').fill('18000000');
  await dealer.getByRole('button', { name: 'Add to stock' }).click();
  await expect(dealer.getByText('SAZO does not know UBX 777Q yet. Enter its VIN or chassis number too.')).toBeVisible();
  await dealer.getByText('Add a car').click();
  await dealer.getByLabel('Number plate').fill('UBX 777Q');
  await dealer.getByLabel('VIN or chassis number').fill('NZE141-9022222');
  await dealer.getByLabel('Asking price (UGX) *').fill('18000000');
  await dealer.getByRole('button', { name: 'Add to stock' }).click();
  await expect(dealer.getByRole('status')).toContainText('Added to your stock');
  await expect(dealer.getByRole('listitem').filter({ hasText: 'UBX 777Q' })).toContainText('Not yet confirmed');
  await a11y(dealer);
  await shot(dealer, 'dealer-stock');

  // New price, then a link for a buyer.
  await car.getByText('Change price').click();
  await car.getByLabel(/New asking price/).fill('24000000');
  await car.getByRole('button', { name: 'Save' }).click();
  await expect(dealer.getByRole('status')).toContainText('Price updated');
  await expect(car).toContainText('UGX 24M');
  await car.getByRole('button', { name: 'Link for a buyer' }).click();
  await expect(dealer.getByRole('heading', { name: 'Your link is ready' })).toBeVisible();
  const link = await dealer.locator('p.sazo-id').first().textContent();
  const buyer = await (await browser.newContext()).newPage();
  await buyer.goto(link!);
  await expect(buyer.getByText('UBA 905T').first()).toBeVisible();

  // Sold: the sale price stays private.
  await dealer.goBack();
  await car.getByText('Mark as sold').click();
  await car.getByLabel(/Sold for/).fill('23,000,000');
  await car.getByRole('button', { name: 'Record sale' }).click();
  await expect(dealer.getByRole('status')).toContainText('Sale recorded');
  const sold = dealer.getByRole('listitem').filter({ hasText: 'UBA 905T' });
  await expect(sold).toContainText('Sold');
  await expect(sold).toContainText('UGX 23M');
  await expect(dealer.getByText('The sale price is kept private')).toBeVisible();

  // A salesperson.
  await dealer.getByLabel('Name', { exact: true }).fill('Sam Sales');
  await dealer.getByLabel('Phone', { exact: true }).fill(`0772${stamp.slice(-6)}`);
  await dealer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dealer.getByRole('status')).toContainText('Sam Sales can now sign in');
  await expect(dealer.getByRole('region', { name: 'Your team' })).toContainText('Sam Sales');
});
