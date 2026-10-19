'use server';
// Dealer workspace (P-005, D-120): every change goes through the API, which checks the person works for this
// dealer (and is a manager for costs, commission and settings).
import { normalizeIdentifier } from '@sazo/contracts';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';
import type { SearchResult } from '@/lib/types';
import { IMAGE_TYPES, filesFrom, uploadEvidence } from '@/lib/upload';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const digits = (s: string) => Number(s.replace(/[^\d]/g, ''));
const decimal = (s: string) => Number(s.replace(/,/g, '').replace(/[^\d.]/g, ''));
const orNull = (s: string) => (s ? s : null);
const reason = (err: unknown, fallback: string) => (err instanceof ApiError && err.detail ? err.detail : fallback);
const asDealer = (org: string) => ({ auth: true, headers: { 'X-Organisation-Id': org } });

/** The dealer and car ids from the form, checked so they can only ever name one API path. */
function ids(form: FormData): { org: string; car: string } {
  const org = text(form, 'org');
  const car = text(form, 'id');
  if (!UUID.test(org)) redirect('/business');
  return { org, car: UUID.test(car) ? car : '' };
}
const toList = (org: string, q: Record<string, string>): never => redirect(`/dealer/${org}?${new URLSearchParams(q)}`);
const toCar = (org: string, car: string, q: Record<string, string>): never => redirect(car ? `/dealer/${org}/car/${car}?${new URLSearchParams(q)}${q.at ? `#${q.at}` : ''}` : `/dealer/${org}?${new URLSearchParams(q)}`);

/** Upload an odometer photo for a mileage; sends the dealer back with SAZO's reason if the photo fails its checks. */
async function odometerFor(form: FormData, km: number | undefined, fail: (msg: string) => never): Promise<string | undefined> {
  if (km === undefined) return undefined;
  const [photo] = filesFrom(form, 'odometer');
  if (!photo) fail('Add a photo of the odometer with the mileage.');
  if (!IMAGE_TYPES.includes(photo!.type)) fail('The odometer photo must be a JPEG, PNG or WebP image.');
  let res: { id: string; problem?: string } | undefined;
  try { res = await uploadEvidence(photo!, 'odometer_photo'); } catch { fail('The odometer photo could not be sent. Please try again.'); }
  if (res!.problem) fail(`${res!.problem}. Please take a clear, new photo of the odometer.`);
  return res!.id;
}

/** How SAZO should find the car: by its reference when the plate or chassis is already known, otherwise as typed. */
async function identifiers(plate: string, anchor: string, fail: (msg: string) => never): Promise<Record<string, string> | undefined> {
  if (!plate && !anchor) return undefined;
  const find = async (q: string) => (await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(q)}`)).matches;
  const byAnchor = anchor ? await find(anchor) : [];
  if (byAnchor.length === 1) return { vehicleRef: byAnchor[0]!.vehicleRef };
  if (anchor) return { ...(anchor.length === 17 ? { vin: anchor } : { chassisNumber: anchor }), ...(plate ? { plate } : {}) };
  const byPlate = await find(plate);
  if (byPlate.length === 1) return { vehicleRef: byPlate[0]!.vehicleRef };
  return fail(byPlate.length > 1 ? `More than one car uses ${plate}. Enter the chassis number too.` : `SAZO does not know ${plate} yet. Enter its chassis number too.`);
}

function details(form: FormData, keys: string[]) {
  const d: Record<string, unknown> = {};
  const has = (k: string) => keys.includes(k) && form.has(k);
  for (const k of ['make', 'model', 'colour', 'yard', 'fuel', 'transmission', 'customsStatus']) if (has(k)) d[k] = orNull(text(form, k));
  for (const k of ['modelYear', 'engineCc']) if (has(k)) d[k] = text(form, k) ? digits(text(form, k)) : null;
  for (const k of ['receivedOn', 'bondArrivedOn', 'customsDeadline', 'customsExtensionUntil']) if (has(k)) d[k] = orNull(text(form, k));
  if (has('customsValue')) d.customsValueUgx = text(form, 'customsValue') ? digits(text(form, 'customsValue')) : null;
  if (has('tiktokUrl')) d.tiktokUrl = orNull(text(form, 'tiktokUrl'));
  if (has('stage') && text(form, 'stage')) d.stage = text(form, 'stage');
  return d;
}

/** Add a car (step 1). With the chassis number or a known plate it joins SAZO history now; otherwise when linked later. */
export async function addStock(form: FormData) {
  const { org } = ids(form);
  const fail = (error: string) => toList(org, { error, add: '1' });
  const plate = text(form, 'plate').toUpperCase();
  const anchor = normalizeIdentifier(text(form, 'anchor'));
  const price = digits(text(form, 'price'));
  const km = text(form, 'mileage') ? digits(text(form, 'mileage')) : undefined;
  const d = details(form, ['make', 'model', 'modelYear', 'engineCc', 'fuel', 'yard', 'stage']);
  if (!price) fail('Enter the asking price in UGX.');
  if (!plate && !anchor && !d.make) fail('Enter the make and model, or the chassis number.');
  if (km !== undefined && !anchor && !plate) fail('Add the mileage when you add the chassis number.');
  const idents = await identifiers(plate, anchor, fail);
  const odometerPhotoId = await odometerFor(form, km, fail);
  let car: string | undefined;
  try {
    car = (await api<{ stockId: string }>('/dealer/stock', { method: 'POST', ...asDealer(org), body: {
      ...(idents ?? {}), askingPriceUgx: price, ...(km !== undefined ? { mileageKm: km, odometerPhotoId } : {}),
      ...(text(form, 'notes') ? { notes: text(form, 'notes') } : {}), details: d } })).stockId;
  } catch (err) { fail(reason(err, 'Could not add the car. Please try again.')); }
  await sendPhotos(org, car!, filesFrom(form, 'photos'));
  toCar(org, car!, { done: idents ? 'Car added. The listing is now part of the car’s SAZO history.' : 'Car added. Add the chassis number when you have it so buyers can see its SAZO history.' });
}

/** Step 2 for a car added without its chassis number. */
export async function linkCar(form: FormData) {
  const { org, car } = ids(form);
  const fail = (error: string) => toCar(org, car, { error, at: 'link' });
  const plate = text(form, 'plate').toUpperCase();
  const anchor = normalizeIdentifier(text(form, 'anchor'));
  if (!anchor && !plate) fail('Enter the chassis number (or the VIN).');
  const km = text(form, 'mileage') ? digits(text(form, 'mileage')) : undefined;
  const idents = await identifiers(plate, anchor, fail);
  const odometerPhotoId = await odometerFor(form, km, fail);
  try {
    await api(`/dealer/stock/${car}/link`, { method: 'POST', ...asDealer(org), body: { ...idents, ...(km !== undefined ? { mileageKm: km, odometerPhotoId } : {}) } });
  } catch (err) { fail(reason(err, 'Could not link the car. Please try again.')); }
  toCar(org, car, { done: 'Linked. The listing is now part of the car’s SAZO history.' });
}

/** Car details, stage and the customs bond clock (whichever fields the form sent). */
export async function updateCar(form: FormData) {
  const { org, car } = ids(form);
  const at = text(form, 'at') || 'details';
  const d = details(form, ['make', 'model', 'modelYear', 'engineCc', 'fuel', 'transmission', 'colour', 'yard', 'stage', 'receivedOn', 'tiktokUrl',
    'bondArrivedOn', 'customsStatus', 'customsDeadline', 'customsExtensionUntil', 'customsValue']);
  try { await api(`/dealer/stock/${car}`, { method: 'PATCH', ...asDealer(org), body: { details: d } }); }
  catch (err) { toCar(org, car, { error: reason(err, 'Could not save. Check the fields and try again.'), at }); }
  toCar(org, car, { done: 'Saved.', at });
}

/** Open to brokers (D-126) and the commission for this car (D-129). */
export async function setBrokerTerms(form: FormData) {
  const { org, car } = ids(form);
  const kind = text(form, 'commissionKind');
  const body: Record<string, unknown> = { openToBrokers: form.get('openToBrokers') === 'on' };
  if (kind === 'fixed') Object.assign(body, { commissionKind: 'fixed', commissionFixedUgx: digits(text(form, 'commissionFixed')) || undefined });
  else if (kind === 'percent') Object.assign(body, { commissionKind: 'percent', commissionPercent: decimal(text(form, 'commissionPercent')) || undefined });
  else body.commissionKind = null;
  try { await api(`/dealer/stock/${car}`, { method: 'PATCH', ...asDealer(org), body: { details: body } }); }
  catch (err) { toCar(org, car, { error: reason(err, 'Could not save the broker terms.'), at: 'brokers' }); }
  toCar(org, car, { done: 'Broker terms saved.', at: 'brokers' });
}

export async function addCost(form: FormData) {
  const { org, car } = ids(form);
  const currency = (text(form, 'currency') || 'UGX').toUpperCase();
  const amount = decimal(text(form, 'amount'));
  const rate = decimal(text(form, 'rate'));
  if (!amount) toCar(org, car, { error: 'Enter the amount.', at: 'costs' });
  if (currency !== 'UGX' && !rate) toCar(org, car, { error: `Enter the rate used to change ${currency} to UGX.`, at: 'costs' });
  try {
    await api(`/dealer/stock/${car}/costs`, { method: 'POST', ...asDealer(org), body: {
      category: text(form, 'category'), amount, currency, ...(currency !== 'UGX' ? { rateToUgx: rate } : {}),
      ...(text(form, 'note') ? { note: text(form, 'note') } : {}), ...(text(form, 'shareRule') ? { shareRule: text(form, 'shareRule') } : {}) } });
  } catch (err) { toCar(org, car, { error: reason(err, 'Could not add the cost.'), at: 'costs' }); }
  toCar(org, car, { done: 'Cost added.', at: 'costs' });
}

export async function reverseCost(form: FormData) {
  const { org, car } = ids(form);
  const entry = text(form, 'entry');
  if (!UUID.test(entry)) toCar(org, car, { error: 'No such cost.', at: 'costs' });
  if (text(form, 'reason').length < 3) toCar(org, car, { error: 'Say why this cost is being cancelled.', at: 'costs' });
  try { await api(`/dealer/stock/${car}/costs/${entry}/reverse`, { method: 'POST', ...asDealer(org), body: { reason: text(form, 'reason') } }); }
  catch (err) { toCar(org, car, { error: reason(err, 'Could not cancel the cost.'), at: 'costs' }); }
  toCar(org, car, { done: 'Cost cancelled. Both entries stay in the ledger.', at: 'costs' });
}

async function sendPhotos(org: string, car: string, files: File[]): Promise<string | undefined> {
  let problem: string | undefined;
  for (const f of files.slice(0, 6)) {
    if (!IMAGE_TYPES.includes(f.type)) { problem = 'Photos must be JPEG, PNG or WebP images.'; continue; }
    try {
      const up = await uploadEvidence(f, 'vehicle_photo');
      if (up.problem) { problem = `${up.problem}. That photo was not added.`; continue; }
      await api(`/dealer/stock/${car}/photos`, { method: 'POST', ...asDealer(org), body: { evidenceId: up.id } });
    } catch (err) { problem = reason(err, 'A photo could not be sent.'); }
  }
  return problem;
}

export async function addPhotos(form: FormData) {
  const { org, car } = ids(form);
  const files = filesFrom(form, 'photos');
  if (!files.length) toCar(org, car, { error: 'Pick one or more photos.', at: 'photos' });
  const problem = await sendPhotos(org, car, files);
  if (problem) toCar(org, car, { error: problem, at: 'photos' });
  toCar(org, car, { done: files.length === 1 ? 'Photo added.' : 'Photos added.', at: 'photos' });
}

export async function removePhoto(form: FormData) {
  const { org, car } = ids(form);
  const photo = text(form, 'photo');
  if (UUID.test(photo)) await api(`/dealer/stock/${car}/photos/${photo}`, { method: 'DELETE', ...asDealer(org) }).catch(() => undefined);
  toCar(org, car, { done: 'Photo removed.', at: 'photos' });
}

export async function changePrice(form: FormData) {
  const { org, car } = ids(form);
  const price = digits(text(form, 'price'));
  const go = text(form, 'from') === 'car' ? (q: Record<string, string>) => toCar(org, car, q) : (q: Record<string, string>) => toList(org, q);
  if (!price) go({ error: 'Enter the new asking price.' });
  try { await api(`/dealer/stock/${car}`, { method: 'PATCH', ...asDealer(org), body: { askingPriceUgx: price } }); }
  catch (err) { go({ error: reason(err, 'Could not change the price.') }); }
  go({ done: 'Price updated.' });
}

export async function markSold(form: FormData) {
  const { org, car } = ids(form);
  const price = digits(text(form, 'price'));
  if (!price) toList(org, { error: 'Enter the price it sold for. Buyers never see it.' });
  try {
    await api(`/dealer/stock/${car}/sold`, { method: 'POST', ...asDealer(org), body: { salePriceUgx: price, ...(text(form, 'soldOn') ? { soldOn: text(form, 'soldOn') } : {}) } });
  } catch (err) { toList(org, { error: reason(err, 'Could not record the sale.') }); }
  toList(org, { done: 'Sale recorded.', show: 'sold' });
}

export async function removeStock(form: FormData) {
  const { org, car } = ids(form);
  if (car) await api(`/dealer/stock/${car}`, { method: 'DELETE', ...asDealer(org) }).catch(() => undefined);
  toList(org, { done: 'Removed from your stock.' });
}

export async function saveSettings(form: FormData) {
  const { org } = ids(form);
  const levels = text(form, 'levels').split(/[^\d]+/).filter(Boolean).map(Number);
  try {
    await api('/dealer/settings', { method: 'PUT', ...asDealer(org), body: { stockAgeAlertDays: levels, leadProtectionDays: digits(text(form, 'protection')) } });
  } catch (err) { toList(org, { error: reason(err, 'Could not save the settings. Use up to 5 numbers of days.') }); }
  toList(org, { done: 'Settings saved.' });
}

export async function addStaff(form: FormData) {
  const { org } = ids(form);
  const phone = toE164(text(form, 'phone'));
  if (!phone || text(form, 'name').length < 2) toList(org, { error: 'Enter the person’s name and phone number.' });
  try {
    await api('/garage/staff', { method: 'POST', ...asDealer(org), body: { phone, displayName: text(form, 'name'), role: text(form, 'role') === 'org_manager' ? 'org_manager' : 'org_staff' } });
  } catch (err) { toList(org, { error: reason(err, 'Could not add this person.') }); }
  toList(org, { done: `${text(form, 'name')} can now sign in with their phone and manage your stock.` });
}
