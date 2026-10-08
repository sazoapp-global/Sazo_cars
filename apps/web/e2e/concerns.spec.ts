// A garage reports a problem with a car (O-002): buyers see a neutral "being checked" notice; a SAZO
// reviewer upholds it and buyers then see what was confirmed — never who reported it.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { API, a11y, codesSoFar, createAdmin, lastCode, shot, signIn } from './helpers';

const stamp = String(Date.now()).slice(-7);
const ADMIN = `+2567110${stamp}`;
const OWNER = `+2567120${stamp}`;
const PLATE = 'UBC 144V';

async function apiToken(request: APIRequestContext, phone: string, displayName: string) {
  const before = codesSoFar();
  await request.post(`${API}/auth/otp/request`, { data: { phone } });
  await expect.poll(codesSoFar).toBeGreaterThan(before);
  const res = await request.post(`${API}/auth/otp/verify`, { data: { phone, code: lastCode(), displayName } });
  return { Authorization: `Bearer ${(await res.json()).accessToken}` };
}

test.beforeAll(async ({ request }) => {
  createAdmin(ADMIN, 'Ruth (SAZO reviewer)');
  const admin = await apiToken(request, ADMIN, 'Ruth (SAZO reviewer)');
  const owner = await apiToken(request, OWNER, 'Garage owner');
  const org = await (await request.post(`${API}/organisations`, { headers: owner, data: { type: 'garage', legalName: `Najjera Motors ${stamp} Ltd`, tradingName: `Najjera Motors ${stamp}` } })).json();
  expect((await request.post(`${API}/admin/organisations/${org.id}/decision`, { headers: admin, data: { decision: 'approve', reason: 'Workshop checked' } })).ok()).toBeTruthy();
  const res = await request.post(`${API}/concerns`, { headers: { ...owner, 'X-Organisation-Id': org.id },
    data: { plate: PLATE, category: 'odometer_tampered', description: 'Instrument cluster screws scratched; pedal wear far beyond the reading' } });
  expect(res.status()).toBe(201);
});

test('being checked, then upheld by a reviewer', async ({ browser }) => {
  const buyer = await (await browser.newContext()).newPage();
  await buyer.goto(`/check?q=${encodeURIComponent(PLATE)}`);
  await expect(buyer.getByText('A business has raised a concern about this car. SAZO is checking it.')).toBeVisible();
  await a11y(buyer);
  const carUrl = buyer.url();

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN, { next: '/admin' });
  await admin.getByRole('link', { name: /reported problems to check/ }).click();
  const card = admin.getByRole('listitem').filter({ hasText: PLATE });
  await expect(card).toContainText('Mileage has been wound back');
  await expect(card).toContainText(`Najjera Motors ${stamp}`);
  await a11y(admin);
  await shot(admin, 'admin-concerns');
  await card.getByLabel(/Reason/).fill('Earlier garage records show a much higher reading');
  await card.getByRole('button', { name: 'Uphold' }).click();
  await expect(admin.getByRole('status')).toContainText('Upheld');

  await buyer.goto(carUrl);
  await expect(buyer.getByText('SAZO checked a report that this car’s mileage was wound back, and found the report valid.')).toBeVisible();
  await expect(buyer.getByText('SAZO is checking it')).toHaveCount(0);
  await expect(buyer.locator('main')).not.toContainText('Najjera');
});
