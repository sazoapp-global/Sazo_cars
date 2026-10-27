'use server';
// Dealer workspace (P-005, D-120): every change goes through the API, which checks the person works for this
// dealer (and is a manager for costs, commission and settings).
import { isVehicleKind, normalizeIdentifier } from '@sazo/contracts';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';
import type { SearchResult } from '@/lib/types';
import { readCarsFile } from '@/lib/dealer-import';
import { identifyCar } from './identify-action';
import { UnreadablePicture, filesFrom, isPicture, uploadEvidence } from '@/lib/upload';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const digits = (s: string) => Number(s.replace(/[^\d]/g, ''));
const decimal = (s: string) => Number(s.replace(/,/g, '').replace(/[^\d.]/g, ''));
const orNull = (s: string) => (s ? s : null);
const reason = (err: unknown, fallback: string) => (err instanceof UnreadablePicture ? err.message : err instanceof ApiError && err.detail ? err.detail : fallback);
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
  if (!isPicture(photo!)) fail('The odometer photo must be a JPEG or PNG picture.');
  let res: { id: string; problem?: string } | undefined;
  try { res = await uploadEvidence(photo!, 'odometer_photo'); } catch (err) { fail(reason(err, 'The odometer photo could not be sent. Please try again.')); }
  if (res!.problem) fail(`${res!.problem}. Please take a clear, new photo of the odometer.`);
  return res!.id;
}

/** How SAZO should find the car: by its reference when the plate or chassis is already known, otherwise as typed. */
/**
 * How the car is sent to SAZO. A car SAZO already knows goes by its reference; a car SAZO does not know yet goes
 * by what the dealer typed, and SAZO adds it (D-130). It is never refused for being new.
 */
async function identifiers(plate: string, anchor: string): Promise<Record<string, string> | undefined> {
  if (!plate && !anchor) return undefined;
  const find = async (q: string) => (await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(q)}`)).matches;
  const byAnchor = anchor ? await find(anchor) : [];
  if (byAnchor.length === 1) return { vehicleRef: byAnchor[0]!.vehicleRef };
  if (anchor) return { ...(anchor.length === 17 ? { vin: anchor } : { chassisNumber: anchor }), ...(plate ? { plate } : {}) };
  const byPlate = await find(plate);
  if (byPlate.length === 1) return { vehicleRef: byPlate[0]!.vehicleRef };
  return { plate };
}

interface Added { stockId: string; linked: boolean; waitingForReview?: boolean }
const addedMessage = (a: Added) => a.linked ? 'Car added. It is now in SAZO with its listing.'
  : a.waitingForReview ? 'Car added. SAZO is checking which car this is; it joins SAZO by itself once that is done.'
  : 'Car added. Add the number plate or chassis number when you have it so it joins SAZO.';

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

/**
 * D-148: the kind of car and the "More details" the dealer gave. A detail equal to SAZO's figure for the model is left
 * out, so the report keeps calling it the maker's figure; only what the dealer changed is the dealer's own record.
 */
async function kindAndSpecs(form: FormData, car: { make?: unknown; model?: unknown; chassis?: string }) {
  const out: Record<string, unknown> = {};
  const kind = text(form, 'kind');
  if (form.has('kind')) out.kind = isVehicleKind(kind) ? kind : null;
  if (![...form.keys()].some((k) => k.startsWith('spec_'))) return out;
  const found = await identifyCar({ make: String(car.make ?? ''), model: String(car.model ?? ''), chassis: car.chassis ?? '' });
  const model = found?.spec as Record<string, unknown> | undefined;
  const specs: Record<string, unknown> = {};
  for (const k of ['seats', 'doors', 'cylinders', 'powerHp', 'axles']) {
    const v = text(form, `spec_${k}`).replace(/[,\s]/g, '');
    if (/^\d+$/.test(v) && Number(v) !== model?.[k]) specs[k] = Number(v);
  }
  for (const k of ['fuelKmPerL', 'loadTonnes', 'gvwTonnes']) {
    const v = text(form, `spec_${k}`).replace(/[,\s]/g, '');
    if (/^\d+(\.\d+)?$/.test(v) && Number(v) !== model?.[k]) specs[k] = Number(v);
  }
  for (const k of ['drive', 'steering']) {
    const v = text(form, `spec_${k}`);
    if (v && v !== model?.[k]) specs[k] = v;
  }
  out.specs = specs;
  return out;
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
  Object.assign(d, await kindAndSpecs(form, { make: d.make, model: d.model, chassis: anchor }));
  if (!price) fail('Enter the asking price in UGX.');
  // The kind is filled in on the form as the dealer types; if the form was sent before that finished, SAZO fills it
  // in here the same way. A car added by plate or chassis alone takes its kind from SAZO's records (or the admins' list).
  if (!d.kind && (d.make || anchor)) {
    const found = await identifyCar({ make: String(d.make ?? ''), model: String(d.model ?? ''), chassis: anchor ?? '' });
    if (found?.kind) d.kind = found.kind;
  }
  if (!d.kind && d.make) fail('Choose the kind of car.');
  if (!d.kind) delete d.kind;
  if (!plate && !anchor && !d.make) fail('Enter the make and model, or the number plate or chassis number.');
  if (km !== undefined && !anchor && !plate) fail('Add the mileage with the number plate or chassis number.');
  const idents = await identifiers(plate, anchor);
  const odometerPhotoId = await odometerFor(form, km, fail);
  let added: Added | undefined;
  try {
    added = await api<Added>('/dealer/stock', { method: 'POST', ...asDealer(org), body: {
      ...(idents ?? {}), askingPriceUgx: price, ...(km !== undefined ? { mileageKm: km, odometerPhotoId } : {}),
      ...(text(form, 'notes') ? { notes: text(form, 'notes') } : {}), details: d } });
  } catch (err) { fail(reason(err, 'Could not add the car. Please try again.')); }
  await sendPhotos(org, added!.stockId, filesFrom(form, 'photos'));
  toCar(org, added!.stockId, { done: addedMessage(added!) });
}

/** Step 2 for a car added without its plate or chassis number. */
export async function linkCar(form: FormData) {
  const { org, car } = ids(form);
  const fail = (error: string) => toCar(org, car, { error, at: 'link' });
  const plate = text(form, 'plate').toUpperCase();
  const anchor = normalizeIdentifier(text(form, 'anchor'));
  if (!anchor && !plate) fail('Enter the number plate or the chassis number (or VIN).');
  const km = text(form, 'mileage') ? digits(text(form, 'mileage')) : undefined;
  const idents = await identifiers(plate, anchor);
  const odometerPhotoId = await odometerFor(form, km, fail);
  let linked: Added | undefined;
  try {
    linked = await api<Added>(`/dealer/stock/${car}/link`, { method: 'POST', ...asDealer(org), body: { ...idents, ...(km !== undefined ? { mileageKm: km, odometerPhotoId } : {}) } });
  } catch (err) { fail(reason(err, 'Could not link the car. Please try again.')); }
  toCar(org, car, { done: linked!.waitingForReview ? 'Sent. SAZO is checking which car this is; it joins SAZO by itself once that is done.' : 'Linked. The car is now in SAZO with its listing.' });
}

/** Car details, stage and the customs bond clock (whichever fields the form sent). */
export async function updateCar(form: FormData) {
  const { org, car } = ids(form);
  const at = text(form, 'at') || 'details';
  const d = details(form, ['make', 'model', 'modelYear', 'engineCc', 'fuel', 'transmission', 'colour', 'yard', 'stage', 'receivedOn', 'tiktokUrl',
    'bondArrivedOn', 'customsStatus', 'customsDeadline', 'customsExtensionUntil', 'customsValue']);
  Object.assign(d, await kindAndSpecs(form, { make: d.make, model: d.model, chassis: text(form, 'chassis') }));
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
    if (!isPicture(f)) { problem = 'Photos must be JPEG or PNG pictures.'; continue; }
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
  const fail = (error: string) => (text(form, 'from') === 'car' ? toCar(org, car, { error }) : toList(org, { error }));
  if (!price) fail('Enter the price it sold for. Buyers never see it.');
  try {
    await api(`/dealer/stock/${car}/sold`, { method: 'POST', ...asDealer(org), body: { salePriceUgx: price, ...(text(form, 'soldOn') ? { soldOn: text(form, 'soldOn') } : {}) } });
  } catch (err) { fail(reason(err, 'Could not record the sale.')); }
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
  // Stay on the enquiry; a completed or lost one is under Completed and lost.
  toLeads(org, { done: stage === 'completed' ? 'Sale recorded. The car is marked as sold.' : 'Enquiry moved.', open: lead, ...(stage === 'completed' || stage === 'lost' ? { show: 'closed' } : {}) });
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
  go({ done: action === 'approve' ? 'Commission approved.' : action === 'paid' ? 'Marked as paid.' : 'Commission cancelled.', item: c });
}

// Many cars from a file (D-131, managers) ---------------------------------------------------------------

const toImport = (org: string, q: Record<string, string>): never => redirect(`/dealer/${org}/import?${new URLSearchParams(q)}`);

/** Read the file and let SAZO check every row. Nothing is added yet. */
export async function checkCarsFile(form: FormData) {
  const { org } = ids(form);
  const file = form.get('file');
  if (!(file instanceof File)) toImport(org, { error: 'Choose your Excel or CSV file.' });
  const read = await readCarsFile(file as File);
  if (!read.ok) toImport(org, { error: read.error });
  let id: string | undefined;
  try {
    id = (await api<{ importId: string }>('/dealer/imports', { method: 'POST', ...asDealer(org), body: { fileName: (file as File).name.slice(0, 200) || 'cars', rows: (read as { rows: Record<string, string>[] }).rows } })).importId;
  } catch (err) { toImport(org, { error: reason(err, 'SAZO could not check the file. Please try again.') }); }
  toImport(org, { file: id! });
}

/** Add the rows that are ready. */
export async function addCarsFromFile(form: FormData) {
  const { org } = ids(form);
  const file = text(form, 'file');
  if (!UUID.test(file)) toImport(org, {});
  let added = 0;
  try {
    const res = await api<{ results: { stockId?: string }[] | null }>(`/dealer/imports/${file}/add`, { method: 'POST', ...asDealer(org) });
    added = (res.results ?? []).filter((r) => r.stockId).length;
  } catch (err) { toImport(org, { file, error: reason(err, 'SAZO could not add the cars. Please try again.') }); }
  toImport(org, { file, done: added === 1 ? '1 car added.' : `${added} cars added.` });
}

// Payments (D-146, managers) ----------------------------------------------------------------------------------

const toPayments = (org: string, q: Record<string, string>): never => redirect(`/dealer/${org}/payments?${new URLSearchParams(q)}`);
const PAY_METHODS = ['cash', 'mtn_momo', 'airtel_money', 'bank'];

/** The payment part of the sale form: buyer, cash or instalments, what was paid at the sale. */
function planFrom(form: FormData, fail: (msg: string) => never): Record<string, unknown> {
  const leadId = text(form, 'leadId');
  const name = text(form, 'buyerName');
  const phone = toE164(text(form, 'buyerPhone'));
  if (!UUID.test(leadId) && (name.length < 2 || !phone)) fail('Choose the buyer from the enquiries, or give their name and a phone number like 0772 123 456.');
  const kind = text(form, 'kind') === 'instalments' ? 'instalments' : 'cash';
  const method = PAY_METHODS.includes(text(form, 'method')) ? text(form, 'method') : 'cash';
  const plan: Record<string, unknown> = {
    buyer: UUID.test(leadId) ? { leadId } : { name, phone },
    kind,
    reminders: form.get('reminders') === 'on',
    paidAtSale: { method, ...(text(form, 'reference') ? { reference: text(form, 'reference') } : {}) },
  };
  if (kind === 'instalments') {
    const months = digits(text(form, 'months'));
    if (!months || months > 120) fail('Enter the number of monthly payments (1 to 120).');
    if (!text(form, 'firstDueOn')) fail('Enter when the first monthly payment is due.');
    plan.depositUgx = digits(text(form, 'deposit'));
    plan.months = months;
    plan.firstDueOn = text(form, 'firstDueOn');
    if (!plan.depositUgx) delete plan.paidAtSale;
  }
  return plan;
}

/** Sell a car: the sale, then (managers) how it is paid for. Opens the payments of the car afterwards. */
export async function sellCar(form: FormData) {
  const { org, car } = ids(form);
  const price = digits(text(form, 'price'));
  const fail = (error: string): never => toCar(org, car, { error });
  if (!price) fail('Enter the price it sold for. Buyers never see it.');
  const withPlan = form.has('kind');
  const plan = withPlan ? planFrom(form, fail) : undefined;
  try {
    await api(`/dealer/stock/${car}/sold`, { method: 'POST', ...asDealer(org), body: { salePriceUgx: price, ...(text(form, 'soldOn') ? { soldOn: text(form, 'soldOn') } : {}) } });
  } catch (err) { fail(reason(err, 'Could not record the sale.')); }
  if (!plan) toList(org, { done: 'Sale recorded.', show: 'sold' });
  let planId = '';
  try {
    planId = (await api<{ planId: string }>(`/dealer/stock/${car}/payment-plan`, { method: 'POST', ...asDealer(org), body: plan })).planId;
  } catch (err) {
    toPayments(org, { error: `The sale is recorded, but not how it is paid: ${reason(err, 'please try again')}. Add it below.` });
  }
  toPayments(org, { plan: planId, done: 'Sale recorded. The buyer gets an SMS receipt for what they paid.' });
}

/** How an already sold car is paid for (a sale recorded before, or by sales staff). */
export async function addPaymentPlan(form: FormData) {
  const { org, car } = ids(form);
  const fail = (error: string): never => toPayments(org, { error, add: car });
  const plan = planFrom(form, fail);
  let planId = '';
  try {
    planId = (await api<{ planId: string }>(`/dealer/stock/${car}/payment-plan`, { method: 'POST', ...asDealer(org), body: plan })).planId;
  } catch (err) { fail(reason(err, 'Could not save how the car is paid for.')); }
  toPayments(org, { plan: planId, done: 'Payment record saved.' });
}

/** A payment received: saved for good, with an SMS receipt to the buyer. */
export async function recordPayment(form: FormData) {
  const org = text(form, 'org');
  const plan = text(form, 'plan');
  if (!UUID.test(org) || !UUID.test(plan)) redirect('/business');
  const fail = (error: string): never => toPayments(org, { plan, error });
  const amount = digits(text(form, 'amount'));
  if (!amount) fail('Enter the amount received.');
  const method = PAY_METHODS.includes(text(form, 'method')) ? text(form, 'method') : '';
  if (!method) fail('Choose how it was paid.');
  let receipt = '';
  try {
    receipt = (await api<{ receiptNo: string }>(`/dealer/payments/${plan}/payments`, { method: 'POST', ...asDealer(org), body: {
      amountUgx: amount, method, paidOn: text(form, 'paidOn'), ...(text(form, 'reference') ? { reference: text(form, 'reference') } : {}),
    } })).receiptNo;
  } catch (err) { fail(reason(err, 'Could not save the payment.')); }
  toPayments(org, { plan, done: `Payment saved. Receipt ${receipt} was sent to the buyer by SMS.` });
}

/** A mistaken payment is corrected (both stay on record), never edited. */
export async function correctPayment(form: FormData) {
  const org = text(form, 'org');
  const plan = text(form, 'plan');
  const payment = text(form, 'payment');
  if (!UUID.test(org) || !UUID.test(plan) || !UUID.test(payment)) redirect('/business');
  if (text(form, 'reason').length < 3) toPayments(org, { plan, error: 'Say why the payment is being corrected.' });
  try {
    await api(`/dealer/payments/${plan}/payments/${payment}/correct`, { method: 'POST', ...asDealer(org), body: { reason: text(form, 'reason') } });
  } catch (err) { toPayments(org, { plan, error: reason(err, 'Could not correct the payment.') }); }
  toPayments(org, { plan, done: 'Payment corrected. Both stay on record.' });
}
