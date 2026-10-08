'use server';
// Dealer workspace (P-005): every change goes through the API, which checks the person works for this dealer.
import { createHash } from 'node:crypto';
import { normalizeIdentifier } from '@sazo/contracts';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';
import type { SearchResult } from '@/lib/types';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const digits = (s: string) => Number(s.replace(/[^\d]/g, ''));
const back = (org: string, q: Record<string, string>): never => redirect(`/dealer/${org}?${new URLSearchParams(q)}`);
const asDealer = (org: string) => ({ auth: true, headers: { 'X-Organisation-Id': org } });
const reason = (err: unknown, fallback: string) => (err instanceof ApiError && err.detail ? err.detail : fallback);

/** Add a car to stock: found by plate (or VIN/chassis); a car SAZO doesn't know needs its VIN or chassis number. */
export async function addStock(form: FormData) {
  const org = text(form, 'org');
  const plate = text(form, 'plate').toUpperCase();
  const anchor = normalizeIdentifier(text(form, 'anchor'));
  const price = digits(text(form, 'price'));
  const km = text(form, 'mileage') ? digits(text(form, 'mileage')) : undefined;
  if (!plate && !anchor) back(org, { error: 'Enter the number plate or the VIN / chassis number.' });
  if (!price) back(org, { error: 'Enter the asking price in UGX.' });
  // A mileage needs a photo of the odometer (Security S3), uploaded through this server like other evidence.
  const photo = form.get('odometer');
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (km !== undefined && !hasPhoto) back(org, { error: 'Add a photo of the odometer with the mileage.' });
  if (hasPhoto && !['image/jpeg', 'image/png', 'image/webp'].includes((photo as File).type)) back(org, { error: 'The odometer photo must be a JPEG, PNG or WebP image.' });
  let odometerPhotoId: string | undefined;
  if (km !== undefined) {
    try {
      const f = photo as File;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const slot = await api<{ evidenceId: string }>('/evidence/uploads', { method: 'POST', auth: true, body: {
        kind: 'odometer_photo', mimeType: f.type, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } });
      await api(`/evidence/uploads/${slot.evidenceId}/content`, { method: 'PUT', auth: true, raw: { bytes, contentType: f.type } });
      await api(`/evidence/${slot.evidenceId}/complete`, { method: 'POST', auth: true });
      odometerPhotoId = slot.evidenceId;
    } catch {
      back(org, { error: 'The odometer photo could not be sent. Please try again.' });
    }
  }
  const find = async (q: string) => (await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(q)}`)).matches;
  let body: Record<string, unknown>;
  const byAnchor = anchor ? await find(anchor) : [];
  if (byAnchor.length === 1) body = { vehicleRef: byAnchor[0]!.vehicleRef };
  else if (anchor) body = { ...(anchor.length === 17 ? { vin: anchor } : { chassisNumber: anchor }), ...(plate ? { plate } : {}) };
  else {
    const byPlate = await find(plate);
    if (byPlate.length === 1) body = { vehicleRef: byPlate[0]!.vehicleRef };
    else back(org, { error: byPlate.length > 1 ? `More than one car uses ${plate}. Enter the VIN or chassis number too.` : `SAZO does not know ${plate} yet. Enter its VIN or chassis number too.` });
  }
  try {
    await api('/dealer/stock', { method: 'POST', ...asDealer(org), body: { ...body!, askingPriceUgx: price, ...(km !== undefined ? { mileageKm: km, odometerPhotoId } : {}), ...(text(form, 'notes') ? { notes: text(form, 'notes') } : {}) } });
  } catch (err) {
    back(org, { error: reason(err, 'Could not add the car. Please try again.') });
  }
  back(org, { done: 'Added to your stock. The listing is now part of the car’s history.' });
}

export async function changePrice(form: FormData) {
  const org = text(form, 'org');
  const price = digits(text(form, 'price'));
  if (!price) back(org, { error: 'Enter the new asking price.' });
  try {
    await api(`/dealer/stock/${text(form, 'id')}`, { method: 'PATCH', ...asDealer(org), body: { askingPriceUgx: price } });
  } catch (err) { back(org, { error: reason(err, 'Could not change the price.') }); }
  back(org, { done: 'Price updated.' });
}

export async function markSold(form: FormData) {
  const org = text(form, 'org');
  const price = digits(text(form, 'price'));
  if (!price) back(org, { error: 'Enter the price it sold for. Buyers never see it.' });
  try {
    await api(`/dealer/stock/${text(form, 'id')}/sold`, { method: 'POST', ...asDealer(org), body: { salePriceUgx: price, ...(text(form, 'soldOn') ? { soldOn: text(form, 'soldOn') } : {}) } });
  } catch (err) { back(org, { error: reason(err, 'Could not record the sale.') }); }
  back(org, { done: 'Sale recorded.', show: 'sold' });
}

export async function removeStock(form: FormData) {
  const org = text(form, 'org');
  await api(`/dealer/stock/${text(form, 'id')}`, { method: 'DELETE', ...asDealer(org) }).catch(() => undefined);
  back(org, { done: 'Removed from your stock.' });
}

export async function addStaff(form: FormData) {
  const org = text(form, 'org');
  const phone = toE164(text(form, 'phone'));
  if (!phone || text(form, 'name').length < 2) back(org, { error: 'Enter the person’s name and phone number.' });
  try {
    await api('/garage/staff', { method: 'POST', ...asDealer(org), body: { phone, displayName: text(form, 'name'), role: text(form, 'role') === 'org_manager' ? 'org_manager' : 'org_staff' } });
  } catch (err) { back(org, { error: reason(err, 'Could not add this person.') }); }
  back(org, { done: `${text(form, 'name')} can now sign in with their phone and manage your stock.` });
}
