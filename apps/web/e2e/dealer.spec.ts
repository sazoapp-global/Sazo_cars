// A car dealer registers, is approved, lists a known car, adds a car still shipping (chassis number later),
// enters its bond deadline, import costs and broker terms, changes a price, sends a buyer a report link,
// records a sale (price kept private) and adds a salesperson.
import { expect, test } from '@playwright/test';
import { a11y, createAdmin, shot, signIn, testPhoto } from './helpers';

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
  /** The "Add a car" panel stays open after a mistake; open it only if it is closed. */
  const openAdd = async () => { if (!(await dealer.getByLabel('Make', { exact: true }).isVisible())) await dealer.getByText('Add a car', { exact: true }).click(); };
  const openMileage = async () => { if (!(await dealer.getByLabel('Mileage now (km)').isVisible())) await dealer.getByText(/Add the mileage now/).click(); };

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin/organisations' });
  const card = admin.getByRole('listitem').filter({ hasText: NAME });
  await card.getByLabel(/Reason/).fill('Yard visited; trading licence valid');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByRole('status')).toContainText('approve');

  await dealer.goto(businessUrl);
  await dealer.getByRole('link', { name: 'Open your stock' }).click();
  await expect(dealer.getByRole('heading', { name: `${NAME}: cars for sale` })).toBeVisible();
  const listUrl = dealer.url();
  await a11y(dealer);

  // A known car, by plate. A mileage needs an odometer photo.
  await openAdd();
  await dealer.getByLabel('Number plate').fill('uba 905t');
  await dealer.getByLabel('Asking price (UGX) *').fill('25,500,000');
  await openMileage();
  await dealer.getByLabel('Mileage now (km)').fill('150000');
  await dealer.getByRole('button', { name: 'Add the car' }).click();
  await expect(dealer.getByText('Add a photo of the odometer with the mileage.')).toBeVisible();
  await openAdd();
  await dealer.getByLabel('Number plate').fill('uba 905t');
  await dealer.getByLabel('Asking price (UGX) *').fill('25,500,000');
  await openMileage();
  await dealer.getByLabel('Mileage now (km)').fill('150000');
  await dealer.getByLabel('Odometer photo').setInputFiles({ name: 'odo.png', mimeType: 'image/png', buffer: testPhoto(`dealer odometer ${stamp}`) });
  await dealer.getByRole('button', { name: 'Add the car' }).click();
  await expect(dealer.getByRole('status')).toContainText('The listing is now part of the car’s SAZO history');
  await expect(dealer.getByRole('region', { name: 'What SAZO records show' })).toBeVisible();

  // A car still on its way from Japan: make and model now, chassis number later.
  await dealer.goto(listUrl);
  await openAdd();
  await dealer.getByLabel('Make', { exact: true }).fill('toyota');
  await dealer.getByLabel('Model', { exact: true }).fill('harrier');
  await dealer.getByLabel('Year', { exact: true }).fill('2018');
  await dealer.getByLabel('Asking price (UGX) *').fill('75000000');
  await dealer.getByLabel('Where is it now?').selectOption('shipping');
  await dealer.getByLabel('Photos of the car').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: testPhoto(`harrier front ${stamp}`) });
  await dealer.getByRole('button', { name: 'Add the car' }).click();
  await expect(dealer.getByRole('status')).toContainText('Add the chassis number when you have it');
  await expect(dealer.getByRole('heading', { name: '2018 Toyota Harrier' })).toBeVisible();
  await expect(dealer.getByRole('img', { name: /2018 Toyota Harrier, photo 1/ })).toBeVisible();
  const linkForm = dealer.getByRole('region', { name: 'Add the chassis number' });
  await linkForm.getByLabel(/Chassis number or VIN/).fill(`ZSU60-${stamp}`);
  await linkForm.getByLabel('Number plate').fill('UBX 777Q');
  await linkForm.getByRole('button', { name: 'Link to SAZO' }).click();
  await expect(dealer.getByRole('status')).toContainText('Linked');
  await expect(dealer.getByText('Not yet confirmed')).toBeVisible();

  // The customs bond deadline the dealer was given.
  const inTen = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const bond = dealer.getByRole('region', { name: 'Customs bond' });
  await bond.getByLabel('Customs status').selectOption('in_bond');
  await bond.getByLabel('Bond deadline').fill(inTen);
  await bond.getByRole('button', { name: 'Save' }).click();
  await expect(dealer.getByText(/Bond deadline .*, 10 days left/)).toBeVisible();

  // Import costs in their own currency (managers only).
  const costs = dealer.getByRole('region', { name: 'Costs' });
  await costs.getByLabel('Amount', { exact: true }).fill('1500');
  await costs.getByLabel('Currency').selectOption('USD');
  await costs.getByLabel(/Rate to UGX/).fill('3,700');
  await costs.getByLabel('What was it for?').selectOption('freight_insurance');
  await costs.getByRole('button', { name: 'Add the cost' }).click();
  await expect(dealer.getByRole('status')).toContainText('Cost added');
  await expect(dealer.getByRole('region', { name: 'Costs' })).toContainText('5,550,000');

  // Open to brokers with a fixed commission.
  const brokers = dealer.getByRole('region', { name: 'Brokers' });
  await brokers.getByLabel('Commission').selectOption('fixed');
  await brokers.getByLabel('Amount (UGX)').fill('500,000');
  await brokers.getByRole('button', { name: 'Save' }).click();
  await expect(dealer.getByRole('status')).toContainText('Broker terms saved');
  await a11y(dealer);
  await shot(dealer, 'dealer-car');

  // Share the car on WhatsApp; a buyer opens the page and asks about it.
  const share = dealer.getByRole('region', { name: 'Share the car' });
  await share.getByLabel('Where will you share it?').selectOption('whatsapp');
  await share.getByRole('button', { name: 'Make a link' }).click();
  await expect(dealer.getByText('Your WhatsApp link is ready')).toBeVisible();
  const carLink = (await dealer.locator('#share p.sazo-id').textContent())!;
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(carLink);
  await expect(visitor.getByRole('heading', { name: '2018 Toyota Harrier' })).toBeVisible();
  await expect(visitor.getByText(`For sale at ${NAME}`)).toBeVisible();
  await expect(visitor.getByRole('img', { name: /photo 1 of 1/ })).toBeVisible();
  await expect(visitor.getByRole('region', { name: 'What SAZO records show' })).toBeVisible();
  await a11y(visitor);
  await visitor.getByLabel('Your name').fill('Peter Okello');
  await visitor.getByLabel('Phone number').fill('0701 234 567');
  await visitor.getByLabel(/I agree that the seller may contact me/).check();
  await visitor.getByRole('button', { name: 'Send' }).click();
  await expect(visitor.getByRole('status')).toContainText(`${NAME} will contact you`);
  await shot(visitor, 'car-page');

  await dealer.goto(`${listUrl}/enquiries`);
  const lead = dealer.getByRole('listitem').filter({ hasText: 'Peter Okello' });
  await expect(lead).toContainText('2018 Toyota Harrier');
  await expect(lead).toContainText('+256701234567');
  await lead.getByLabel('Move to').selectOption('viewing');
  await lead.getByRole('button', { name: 'Move' }).click();
  await expect(dealer.getByRole('status')).toContainText('Enquiry moved');
  await expect(dealer.getByRole('listitem').filter({ hasText: 'Peter Okello' })).toContainText('Viewing');
  await a11y(dealer);
  await shot(dealer, 'dealer-enquiries');

  await dealer.goto(listUrl);
  const car = dealer.getByRole('listitem').filter({ hasText: 'UBA 905T' });
  await expect(car).toContainText('UGX 25.5M');
  await expect(dealer.getByRole('listitem').filter({ hasText: 'UBX 777Q' })).toContainText('10 days left');
  await shot(dealer, 'dealer-stock');

  // New price, then a link for a buyer.
  await car.getByText('Change price').click();
  await car.getByLabel(/New asking price/).fill('24000000');
  await car.getByRole('button', { name: 'Save' }).click();
  await expect(dealer.getByRole('status')).toContainText('Price updated');
  await expect(car).toContainText('UGX 24M');
  await car.getByRole('button', { name: 'Report link for a buyer' }).click();
  await expect(dealer.getByRole('heading', { name: 'Your link is ready' })).toBeVisible();
  const link = await dealer.locator('p.sazo-id').first().textContent();
  const buyer = await (await browser.newContext()).newPage();
  await buyer.goto(link!);
  await expect(buyer.getByText('UBA 905T').first()).toBeVisible();

  // Sold: the sale price stays private.
  await dealer.goBack();
  await car.getByText('Mark as sold').click();
  await car.getByLabel(/Sold for/).fill('23,000,000');
  await car.getByRole('button', { name: 'Record the sale' }).click();
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
