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
  const wa = text(form, 'whatsapp') ? toE164(text(form, 'whatsapp')) : null;
  if (text(form, 'whatsapp') && !wa) toList(org, { error: 'Enter the WhatsApp number like 0772 123 456.' });
  try {
    await api('/dealer/settings', { method: 'PUT', ...asDealer(org), body: { stockAgeAlertDays: levels, leadProtectionDays: digits(text(form, 'protection')), whatsappE164: wa } });
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

// Selling (D-125 step 2) --------------------------------------------------------------------------------

const CHANNELS = ['whatsapp', 'tiktok', 'facebook', 'instagram', 'other'];
const SOURCES = ['whatsapp', 'tiktok', 'facebook', 'instagram', 'walk_in', 'phone_call', 'other'];
const STAGES = ['enquiry', 'viewing', 'negotiation', 'deposit', 'handover', 'completed', 'lost'];
const toLeads = (org: string, q: Record<string, string>): never => redirect(`/dealer/${org}/enquiries?${new URLSearchParams(q)}`);

/** A link to share the car on WhatsApp, TikTok or Facebook. The full link is shown once on the car page. */
export async function createLink(form: FormData) {
  const { org, car } = ids(form);
  const channel = CHANNELS.includes(text(form, 'channel')) ? text(form, 'channel') : 'whatsapp';
  let token = '';
  try {
    token = (await api<{ token: string }>(`/dealer/stock/${car}/links`, { method: 'POST', ...asDealer(org), body: { channel, showDealerName: form.get('showDealerName') === 'on' } })).token;
  } catch (err) { toCar(org, car, { error: reason(err, 'Could not make the link.'), at: 'share' }); }
  toCar(org, car, { link: token, ch: channel, at: 'share' });
}

export async function revokeLink(form: FormData) {
  const { org, car } = ids(form);
  const link = text(form, 'link');
  if (UUID.test(link)) await api(`/dealer/links/${link}`, { method: 'DELETE', ...asDealer(org) }).catch(() => undefined);
  toCar(org, car, { done: 'That link no longer works.', at: 'share' });
}

/** An enquiry added by staff: a walk-in, a phone call or a WhatsApp message. */
export async function addLead(form: FormData) {
  const { org, car } = ids(form);
  const phone = toE164(text(form, 'phone'));
  if (text(form, 'name').length < 2 || !phone) toLeads(org, { error: 'Enter the customer’s name and phone number.', add: '1' });
  const source = SOURCES.includes(text(form, 'source')) ? text(form, 'source') : 'other';
  try {
    await api('/dealer/leads', { method: 'POST', ...asDealer(org), body: { name: text(form, 'name'), phone, source, consent: form.get('consent') === 'on',
      ...(car ? { stockId: car } : {}), ...(text(form, 'message') ? { message: text(form, 'message') } : {}) } });
  } catch (err) { toLeads(org, { error: reason(err, 'Could not add the enquiry.'), add: '1' }); }
  toLeads(org, { done: 'Enquiry added.' });
}

/** Move an enquiry to another stage. Completed records the sale, with its private price. */
export async function moveLead(form: FormData) {
  const { org } = ids(form);
  const lead = text(form, 'lead');
  const stage = text(form, 'stage');
  if (!UUID.test(lead) || !STAGES.includes(stage)) toLeads(org, { error: 'Choose a stage.' });
  const price = text(form, 'price') ? digits(text(form, 'price')) : undefined;
  if (stage === 'completed' && !price) toLeads(org, { error: 'Enter the price the car sold for. Buyers never see it.', open: lead });
  try {
    await api(`/dealer/leads/${lead}`, { method: 'PATCH', ...asDealer(org), body: { stage, ...(price ? { salePriceUgx: price } : {}), ...(text(form, 'note') ? { note: text(form, 'note') } : {}) } });
  } catch (err) { toLeads(org, { error: reason(err, 'Could not move the enquiry.'), open: lead }); }
  toLeads(org, { done: stage === 'completed' ? 'Sale recorded. The car is marked as sold.' : 'Enquiry moved.' });
}

export async function noteLead(form: FormData) {
  const { org } = ids(form);
  const lead = text(form, 'lead');
  if (!UUID.test(lead) || text(form, 'note').length < 2) toLeads(org, { error: 'Write a note first.' });
  try { await api(`/dealer/leads/${lead}/notes`, { method: 'POST', ...asDealer(org), body: { note: text(form, 'note') } }); }
  catch (err) { toLeads(org, { error: reason(err, 'Could not save the note.') }); }
  toLeads(org, { done: 'Note saved.', open: lead });
}

// Brokers (D-128, D-129) ----------------------------------------------------------------------------------

/** A manager decides who brought a customer two people claimed; the reason is kept. */
export async function decideLead(form: FormData) {
  const { org } = ids(form);
  const lead = text(form, 'lead');
  const outcome = ['keep', 'earlier', 'split', 'dealer'].includes(text(form, 'outcome')) ? text(form, 'outcome') : 'keep';
  if (!UUID.test(lead)) toLeads(org, { error: 'No such enquiry.' });
  if (text(form, 'reason').length < 3) toLeads(org, { error: 'Write the reason for the decision.', open: lead });
  try {
    await api(`/dealer/leads/${lead}/decision`, { method: 'POST', ...asDealer(org), body: { outcome, reason: text(form, 'reason'),
      ...(outcome === 'split' ? { splitPercent: digits(text(form, 'split')) || 50 } : {}) } });
  } catch (err) { toLeads(org, { error: reason(err, 'Could not save the decision.') }); }
  toLeads(org, { done: 'Decision saved. Commission follows it.' });
}

/** Approve a commission, mark it paid (with the payment reference) or cancel it (with a reason). Records only. */
export async function commissionAction(form: FormData) {
  const { org } = ids(form);
  const c = text(form, 'commission');
  const action = ['approve', 'paid', 'cancel'].includes(text(form, 'action')) ? text(form, 'action') : '';
  const go = (q: Record<string, string>): never => redirect(`/dealer/${org}/commissions?${new URLSearchParams(q)}`);
  if (!UUID.test(c) || !action) go({ error: 'Choose what to do.' });
  if (action === 'cancel' && text(form, 'note').length < 3) go({ error: 'Say why the commission is cancelled.' });
  try {
    await api(`/dealer/commissions/${c}/${action}`, { method: 'POST', ...asDealer(org), body: text(form, 'note') ? { note: text(form, 'note') } : {} });
  } catch (err) { go({ error: reason(err, 'Could not update the commission.') }); }
  go({ done: action === 'approve' ? 'Commission approved.' : action === 'paid' ? 'Marked as paid.' : 'Commission cancelled.' });
}
