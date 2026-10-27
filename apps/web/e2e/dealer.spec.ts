// A car dealer registers, is approved, lists a known car, adds a car still shipping (chassis number later),
// enters its bond deadline, import costs and broker terms, changes a price, sends a buyer a report link,
// records a sale (price kept private) and adds a salesperson.
import { expect, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
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
  // A new dealer goes straight into the dealer console and prepares stock while SAZO checks the business.
  await expect(dealer.getByRole('heading', { name: `${NAME}: cars for sale` })).toBeVisible();
  await expect(dealer.getByRole('heading', { name: 'Registered. SAZO is checking your business' })).toBeVisible();
  const listUrl = dealer.url().replace(/\?.*$/, '');
  const menu = dealer.getByRole('navigation', { name: 'Dealer' });
  await expect(menu.getByRole('link', { name: /Cars for sale/ })).toBeAttached();
  for (const later of ['Enquiries', 'Sold', 'Commission', 'Add many cars', 'Team']) await expect(menu.getByRole('link', { name: later, exact: true })).toHaveCount(0);
  await a11y(dealer);
  // The list only; "Add a car" opens the form in the same space.
  await dealer.getByRole('link', { name: 'Add a car' }).first().click();
  await dealer.getByLabel('Make', { exact: true }).fill('Toyota');
  await dealer.getByLabel('Model', { exact: true }).fill('Wish');
  await dealer.getByLabel('Number plate').fill('UBR 314W');
  await dealer.getByLabel('Asking price (UGX) *').fill('41,000,000');
  await dealer.getByRole('button', { name: 'Add the car' }).click();
  await expect(dealer.getByRole('region', { name: 'Joins SAZO once your business is approved' })).toContainText('Plate UBR 314W');
  await expect(dealer.getByText('Joins SAZO after approval')).toBeVisible();
  await dealer.goto(listUrl);
  await expect(dealer.getByRole('listitem').filter({ hasText: 'UBR 314W' })).toContainText('Joins SAZO after approval');
  await dealer.getByRole('link', { name: 'Finish the approval steps' }).click();
  // The National ID is optional (D-141): this dealer is approved without sending one.
  await expect(dealer.getByRole('heading', { name: 'Your National ID (optional)' })).toBeVisible();
  const businessUrl = dealer.url();
  /** The "Add a car" panel stays open after a mistake; open it only if it is closed. */
  const openAdd = async () => { if (!(await dealer.getByLabel('Make', { exact: true }).isVisible())) await dealer.getByRole('link', { name: 'Add a car' }).first().click(); };
  const openMileage = async () => { if (!(await dealer.getByLabel('Mileage now (km)').isVisible())) await dealer.getByText(/Add the mileage now/).click(); };

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin/organisations' });
  await admin.getByRole('listitem').filter({ hasText: NAME }).getByRole('link').click();
  const card = admin.getByRole('region', { name: 'Details' });
  await card.getByLabel(/Reason/).fill('Yard visited; trading licence valid');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByRole('status')).toContainText('approve');

  await dealer.goto(businessUrl);
  await dealer.getByRole('link', { name: 'Open your stock' }).click();
  await expect(dealer.getByRole('heading', { name: `${NAME}: cars for sale` })).toBeVisible();
  // Approved: the car added while waiting has joined SAZO by itself, and the rest of the console is open.
  await expect(dealer.getByRole('heading', { name: /SAZO is checking your business/ })).toHaveCount(0);
  const wish = dealer.getByRole('listitem').filter({ hasText: 'UBR 314W' });
  await expect(wish).not.toContainText('Joins SAZO after approval');
  await expect(wish).toContainText(/Nothing flagged|to check|serious/);
  await expect(menu.getByRole('link', { name: 'Enquiries', exact: true })).toBeAttached();
  // The garage app's layout: a compact top bar (no site links, the online badge), no site footer,
  // and Appearance as one dropdown in Settings inside the page.
  const top = dealer.getByRole('banner');
  await expect(top.getByText('Online', { exact: true })).toBeVisible();
  await expect(top.getByRole('link', { name: 'Compare Cars' })).toHaveCount(0);
  await expect(dealer.getByRole('contentinfo')).toHaveCount(0);
  await menu.getByRole('link', { name: 'Settings' }).last().click();
  await expect(dealer.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await dealer.getByRole('button', { name: 'Appearance: Same as device' }).click();
  await dealer.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Dark' }).click();
  await expect(dealer.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dealer.getByRole('button', { name: 'Appearance: Dark' }).click();
  await dealer.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Light' }).click();
  await dealer.getByRole('link', { name: 'Close' }).click();
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
  await expect(dealer.getByRole('status')).toContainText('It is now in SAZO with its listing');
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
  await expect(dealer.getByRole('status')).toContainText('Add the number plate or chassis number when you have it');
  await expect(dealer.getByRole('heading', { name: '2018 Toyota Harrier' })).toBeVisible();
  await expect(dealer.getByRole('img', { name: '2018 Toyota Harrier, main photo' })).toBeVisible();
  const linkForm = dealer.getByRole('region', { name: 'Add the plate or chassis number' });
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
  const costs = dealer.getByRole('region', { name: 'Costs', exact: true });
  await costs.getByLabel('Amount', { exact: true }).fill('1500');
  await costs.getByLabel('Currency').selectOption('USD');
  await costs.getByLabel(/Rate to UGX/).fill('3,700');
  await costs.getByLabel('What was it for?').selectOption('freight_insurance');
  await costs.getByRole('button', { name: 'Add the cost' }).click();
  await expect(dealer.getByRole('status')).toContainText('Cost added');
  await expect(dealer.getByRole('region', { name: 'Costs', exact: true })).toContainText('5,550,000');

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
  const enq = dealer.getByRole('listitem').filter({ hasText: 'Peter Okello' });
  await expect(enq).toContainText('2018 Toyota Harrier');
  // An enquiry opens with all its details beside the side bar.
  await enq.getByRole('link').click();
  const lead = dealer.getByRole('region', { name: 'Enquiry from Peter Okello' });
  await expect(lead).toContainText('+256701234567');
  await lead.getByLabel('Move to').selectOption('viewing');
  await lead.getByRole('button', { name: 'Move' }).click();
  await expect(dealer.getByRole('status')).toContainText('Enquiry moved');
  await expect(dealer.getByRole('region', { name: 'Enquiry from Peter Okello' })).toContainText('Viewing');
  await a11y(dealer);
  await shot(dealer, 'dealer-enquiries');

  await dealer.goto(listUrl);
  const row = dealer.getByRole('listitem').filter({ hasText: 'UBA 905T' });
  await expect(row).toContainText('UGX 25.5M');
  await shot(dealer, 'dealer-stock');

  // A car opens with all its details beside the side bar: new price, then a link for a buyer.
  await row.getByRole('link').click();
  const car = dealer.getByRole('main');
  await expect(car.getByRole('region', { name: 'Photos' })).toBeVisible();
  await car.getByText('Change price').click();
  await car.getByLabel(/New asking price/).fill('24000000');
  await car.locator('form', { has: dealer.getByLabel(/New asking price/) }).getByRole('button', { name: 'Save' }).click();
  await expect(dealer.getByRole('status')).toContainText('Price updated');
  await expect(car).toContainText('UGX 24M');
  await car.getByRole('button', { name: 'Report link for a buyer' }).click();
  await expect(dealer.getByRole('heading', { name: 'Your link is ready' })).toBeVisible();
  const link = await dealer.locator('p.sazo-id').first().textContent();
  const buyer = await (await browser.newContext()).newPage();
  await buyer.goto(link!);
  await expect(buyer.getByText('UBA 905T').first()).toBeVisible();

  // Sold on instalments (D-146): the sale price stays private; the plan and payments open beside the side bar.
  await dealer.goBack();
  await car.getByRole('button', { name: 'Mark as sold' }).click();
  const sale = dealer.getByRole('dialog', { name: 'Mark as sold' });
  await sale.getByLabel(/Sold for/).fill('23,000,000');
  await sale.getByLabel("Buyer's name").fill('sarah kemigisha');
  await sale.getByLabel("Buyer's phone").fill(`0774${stamp.slice(-6)}`);
  await sale.getByText('Instalments', { exact: true }).click();
  await sale.getByLabel('Deposit (UGX)').fill('5,000,000');
  await sale.getByLabel('Number of months').fill('6');
  await sale.getByLabel('First due date').fill(new Date(Date.now() + 3 * 3600_000 + 10 * 86_400_000).toISOString().slice(0, 10)); // in 10 days
  await expect(sale).toContainText('6 monthly payments of UGX 3,000,000');
  await sale.getByText('MTN MoMo').click();
  await a11y(dealer);
  await shot(dealer, 'dealer-sell');
  await sale.getByRole('button', { name: 'Save the sale' }).click();
  await expect(dealer.getByRole('status')).toContainText('Sale recorded');
  await expect(dealer.getByRole('heading', { name: /UBA 905T/ })).toBeVisible();
  await expect(dealer.getByRole('main')).toContainText('Sold to Sarah Kemigisha');
  await expect(dealer.getByRole('main')).toContainText('UGX 18M still owed');
  await a11y(dealer);
  await shot(dealer, 'dealer-payments-car');
  // A payment, with its receipt.
  await dealer.getByRole('button', { name: 'Record a payment' }).click();
  const pay = dealer.getByRole('dialog', { name: 'Record a payment' });
  await expect(pay.getByLabel('Amount (UGX)')).toHaveValue('3000000');
  await pay.getByLabel('Amount (UGX)').fill('1,000,000'); // paying in bits is fine
  await pay.getByLabel('How was it paid?').selectOption('cash');
  await pay.getByRole('button', { name: 'Save and send receipt' }).click();
  await expect(dealer.getByRole('status')).toContainText('Receipt R-0002 was sent to the buyer by SMS');
  await expect(dealer.getByRole('main')).toContainText('UGX 17M still owed');
  await dealer.getByRole('link', { name: 'Receipt' }).first().click();
  await expect(dealer.getByRole('heading', { name: 'R-0002' })).toBeVisible();
  await expect(dealer.getByRole('main')).toContainText('UGX 1,000,000');
  // The dashboard: cards that open each part, and sales by month.
  await dealer.goto(`${listUrl}/dashboard`);
  await expect(dealer.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(dealer.getByRole('link', { name: /Still owed to you UGX 17M/ })).toBeVisible();
  await expect(dealer.getByRole('img', { name: /Sales value in UGX by month/ })).toBeVisible();
  await a11y(dealer);
  await shot(dealer, 'dealer-dashboard');
  await dealer.getByRole('link', { name: /Still owed to you/ }).click();
  await expect(dealer.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();
  await expect(dealer.getByRole('list', { name: 'Sales' })).toContainText('Sarah Kemigisha');
  await expect(dealer.getByRole('list', { name: 'Sales' })).toContainText('payment 1 of 6');
  await a11y(dealer);
  // Due soon: her first monthly payment is due in 10 days, so not within 7 days, but within 14.
  await dealer.getByRole('navigation', { name: 'Show' }).getByRole('link', { name: 'Due soon' }).click();
  await expect(dealer.getByText('Nothing due in the next 7 days.')).toBeVisible();
  await dealer.getByRole('navigation', { name: 'Due within' }).getByRole('link', { name: '14 days' }).click();
  await expect(dealer.getByRole('list', { name: 'Sales' })).toContainText('Sarah Kemigisha');
  await dealer.getByText(/^Sort by:/).click();
  await dealer.getByRole('navigation', { name: 'Sort by' }).getByRole('link', { name: 'Balance left' }).click();
  await expect(dealer).toHaveURL(/show=due&sort=balance&within=14/);
  await expect(dealer.getByText('Sort by: Balance left')).toBeVisible();
  await a11y(dealer);
  await dealer.goto(`${listUrl}?show=sold`);
  const sold = dealer.getByRole('listitem').filter({ hasText: 'UBA 905T' });
  await expect(sold).toContainText('Sold');
  await expect(sold).toContainText('UGX 23M');
  await dealer.goto(listUrl);

  // A salesperson.
  await dealer.getByLabel('Name', { exact: true }).fill('Sam Sales');
  await dealer.getByLabel('Phone', { exact: true }).fill(`0772${stamp.slice(-6)}`);
  await dealer.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dealer.getByRole('status')).toContainText('Sam Sales can now sign in');
  await expect(dealer.getByRole('region', { name: 'Your team' })).toContainText('Sam Sales');

  // A car SAZO has never seen, by its plate only: it is added to SAZO, not refused (D-130).
  await dealer.goto(listUrl);
  await openAdd();
  await dealer.getByLabel('Make', { exact: true }).fill('nissan');
  await dealer.getByLabel('Model', { exact: true }).fill('note');
  await dealer.getByLabel('Number plate').fill(`UBY ${String(stamp).slice(-3)}N`);
  await dealer.getByLabel('Asking price (UGX) *').fill('18000000');
  await dealer.getByRole('button', { name: 'Add the car' }).click();
  await expect(dealer.getByRole('status')).toContainText('It is now in SAZO with its listing');
  await expect(dealer.getByRole('region', { name: 'What SAZO records show' })).toBeVisible();

  // Many cars at once from an Excel file (D-131): every row is checked first, then the ready ones are added.
  await dealer.goto(listUrl);
  await dealer.getByRole('link', { name: 'Add many cars' }).first().click();
  await expect(dealer.getByRole('heading', { name: 'Add many cars from a file' })).toBeVisible();
  const template = await dealer.request.get(dealer.url().replace(/\/import.*$/, '/import/template.xlsx'));
  expect(template.headers()['content-type']).toContain('spreadsheetml');
  const sheet = await writeXlsxFile([
    ['Make', 'Model', 'Year', 'Chassis number or VIN', 'Asking price (UGX)', 'Where is it now', 'Cost currency', 'Rate to UGX', 'Car price (purchase or auction)'].map((value) => ({ value })),
    ['Toyota', 'Premio', 2016, `NZT260-${stamp}`, 42000000, 'In the bond', 'USD', 3700, 6200].map((value) => ({ value })),
    ['Honda', 'Fit', 2014, '', '', 'Shipping', '', '', ''].map((value) => ({ value })),
  ]).toBuffer();
  await dealer.getByLabel('Excel (.xlsx) or CSV file').setInputFiles({ name: 'shipment.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: sheet });
  await dealer.getByRole('button', { name: 'Check the file' }).click();
  const rows = dealer.getByRole('list', { name: 'Rows in the file' });
  await expect(rows.getByRole('listitem').filter({ hasText: 'Premio' })).toContainText('Ready');
  await expect(rows.getByRole('listitem').filter({ hasText: 'Fit' })).toContainText('Asking price is missing');
  await a11y(dealer);
  await shot(dealer, 'dealer-import');
  await dealer.getByRole('button', { name: 'Add the 1 ready car' }).click();
  await expect(dealer.getByRole('status')).toContainText('1 car added');
  await rows.getByRole('link', { name: 'Added: open' }).click();
  await expect(dealer.getByRole('heading', { name: /Toyota Premio/ })).toBeVisible();
  await expect(dealer.getByRole('region', { name: 'Costs', exact: true })).toContainText('22,940,000');

  // Signing in again with nowhere particular to go lands the approved dealer on their dashboard (D-146).
  const again = await (await browser.newContext()).newPage();
  await signIn(again, OWNER);
  await expect(again).toHaveURL(new RegExp(`${listUrl.replace(/^https?:\/\/[^/]+/, '')}/dashboard$`));
  await expect(again.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
});
