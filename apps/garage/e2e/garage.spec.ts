// The mechanic's day on a phone: sign in, record a service with an odometer photo, send it; then lose
// signal halfway through the next job and watch it sync when the signal comes back.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API, apiSignIn, createAdmin, sendIdentity, signInInApp, testPhoto } from './helpers';

const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567010${stamp}`;
const MANAGER = `+2567020${stamp}`;
const MANAGER_LOCAL = `0${MANAGER.slice(4)}`; // how a mechanic types it: 0702…
// Photos are real, distinct PNGs (testPhoto) so they pass SAZO's photo checks (X-01); the app re-encodes them like a camera photo.

/** Set SHOTS=<folder> to save screenshots of each step (design review). */
const shot = async (page: Page, name: string) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };



const MECHANIC = `+2567025${stamp}`;
let managerToken: string;
let orgId: string;

test.beforeAll(async ({ request }) => {
  // A SAZO admin (made with the create-admin script) approves a new garage registered by its manager.
  createAdmin(ADMIN, 'E2E Admin');
  const adminToken = await apiSignIn(request, ADMIN);
  managerToken = await apiSignIn(request, MANAGER, 'Sarah Manager');
  const org = await request.post(`${API}/organisations`, { headers: { Authorization: `Bearer ${managerToken}` }, data: { type: 'garage', legalName: `Kansanga Motors ${stamp} Ltd`, tradingName: 'Kansanga Motors' } });
  expect(org.ok()).toBeTruthy();
  orgId = (await org.json()).id;
  await sendIdentity(request, managerToken, `garage manager ${stamp}`);
  const approved = await request.post(`${API}/admin/organisations/${orgId}/decision`, { headers: { Authorization: `Bearer ${adminToken}` }, data: { decision: 'approve', reason: 'E2E' } });
  expect(approved.ok()).toBeTruthy();
});

test('no sign-up in the app: unknown numbers are told to ask their manager; an added mechanic finishes their details once', async ({ page, request }) => {
  await page.goto('/');
  // Email comes first; the phone code is the other tab.
  await expect(page.getByRole('tab', { name: 'Email and password' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Phone code' }).click();
  await page.getByLabel('Your phone number').fill('0709999999');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('alert')).toContainText('Ask your manager to add you');

  // The manager adds a mechanic by name and phone; at first log-in the mechanic gives the details now required (D-101).
  const added = await request.post(`${API}/garage/staff`, { headers: { Authorization: `Bearer ${managerToken}`, 'X-Organisation-Id': orgId }, data: { phone: MECHANIC, displayName: 'Musa Mechanic', role: 'org_staff' } });
  expect(added.ok()).toBeTruthy();
  await signInInApp(page, `0${MECHANIC.slice(4)}`);
  await expect(page.getByRole('heading', { name: 'Finish your details' })).toBeVisible();
  await page.getByLabel('Surname').fill('Kato');
  await page.getByLabel('Given name').fill('musa');
  await page.getByLabel('Male', { exact: true }).check();
  await page.getByLabel('Date of birth').fill('1995-07-07');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('button', { name: 'New job' })).toBeVisible();
  await shot(page, '0-mechanic-home');
});

test('record a service with an odometer photo and send it', async ({ page }) => {
  await signInInApp(page, MANAGER_LOCAL);
  await expect(page.getByRole('banner').getByText('Kansanga Motors')).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Number plate').fill('ubj 214k');
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByText('2016 Toyota Harrier')).toBeVisible();
  await shot(page, '1-car');
  await page.getByRole('button', { name: 'Yes, this is the car' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Service' }).click();
  await page.getByLabel('Describe the job (optional)').fill('Full service. Front brake pads worn, advised the customer.');
  await shot(page, '2-work');
  await page.getByRole('button', { name: 'Next' }).click();

  // A missed digit is caught as you type: lower than the last reading SAZO has, so Next waits.
  await page.getByLabel('Odometer reading').fill('10500');
  await expect(page.getByRole('alert')).toContainText('Lower than the last reading SAZO has');
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByLabel('Odometer reading').fill('110500');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Odometer reading')).toHaveValue('110,500');
  await page.locator('input[type=file]').setInputFiles({ name: 'odo.png', mimeType: 'image/png', buffer: testPhoto('garage.spec.ts odo.png 1') });
  await expect(page.getByAltText(/Odometer photo/)).toBeVisible();
  await shot(page, '3-mileage');
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('button', { name: 'Engine oil' }).click();
  await page.getByRole('button', { name: 'Oil filter' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Customer name').fill('Peter Okello');
  await page.getByLabel('Customer phone').fill('0772 555 789');
  await page.getByLabel(/agreed to get one SMS/).check();
  await page.getByLabel('Total charged').fill('250000');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Peter Okello · will get an SMS')).toBeVisible();
  await expect(page.getByText('Full service. Front brake pads worn, advised the customer.')).toBeVisible();
  await shot(page, '5-review');
  await page.getByLabel(/customer knows this work/).check();
  await page.getByRole('button', { name: 'Send to SAZO' }).click();
  await expect(page.getByRole('heading', { name: 'Added to the car’s history' })).toBeVisible();
  await expect(page.getByText('The customer will get an SMS')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  const job = page.getByRole('button', { name: /UBJ 214K/ }).first();
  await expect(job).toContainText('Waiting for customer');
  await expect(job).toContainText('by Manager Sarah');
  await shot(page, '6-home');

  // Settings open inside the page from More (D-138): dark mode, kept on this phone (D-112).
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More' }).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/more\?panel=settings$/);
  await page.getByRole('button', { name: 'Appearance: Same as device' }).click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.getByRole('button', { name: 'Appearance: Dark' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, '8-dark-more');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeHidden();
  await page.getByRole('button', { name: 'Home' }).click();
  await shot(page, '9-dark-home');
  // Your name in the top bar shows your details only.
  await page.getByRole('button', { name: /^Your details, / }).click();
  const details = page.getByRole('dialog', { name: 'Your details' });
  await expect(details).toContainText('Phone');
  await expect(details.getByRole('link')).toHaveCount(0);
  await details.getByRole('button', { name: 'Close' }).click();
  // On a computer: the fixed side bar, with Settings and Sign out at its foot.
  await page.setViewportSize({ width: 1280, height: 800 });
  const rail = page.getByRole('complementary', { name: 'SAZO Garage menu' });
  await expect(rail.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await rail.getByRole('button', { name: 'Settings' }).click();
  await expect(rail.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Close' }).click();
  await rail.getByRole('button', { name: /Job records/ }).click();
  await expect(rail.getByRole('button', { name: /Job records/ })).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 412, height: 839 });
  // Notifications open inside the page too.
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('navigation', { name: 'More' }).getByRole('button', { name: 'Settings' }).click();
  const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(dark.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Appearance: Dark' }).click();
  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('no signal halfway through a job: everything is kept and syncs when the signal returns', async ({ page, context }) => {
  await signInInApp(page, MANAGER_LOCAL);
  await expect(page.getByRole('button', { name: 'New job' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('You’re offline')).toBeVisible();
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Number plate').fill('UBR 404N');
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByText('No signal. Carry on.')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Electrical work' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Odometer reading').fill('64200');
  await page.locator('input[type=file]').setInputFiles({ name: 'odo.png', mimeType: 'image/png', buffer: testPhoto('garage.spec.ts odo.png 2') });
  await expect(page.getByAltText(/Odometer photo/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Back home while still offline: the job waits on the phone.
  await page.getByRole('button', { name: /SAZO Garage/ }).click();
  const draft = page.getByRole('button', { name: /UBR 404N/ });
  await expect(draft).toContainText('Saved on phone · will upload when online');
  await shot(page, '7-offline-home');

  await context.setOffline(false);
  await expect(draft).toContainText('Saved to SAZO', { timeout: 20_000 });
});
