'use server';
// "My cars" (O-007): prove a car is yours by phone match, or by a logbook photo a SAZO reviewer checks.
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const go = (path: string, q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** "This is my car": try the phone match first; if the phone isn't on the registry record, ask for the logbook. */
export async function claimCar(form: FormData) {
  const ref = text(form, 'ref');
  let result: { status: string } | undefined;
  try {
    result = await api<{ status: string }>(`/vehicles/${ref}/ownership-claims`, { method: 'POST', auth: true, body: {} });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'no_phone_match') redirect(`/v/${ref}/claim`);
    go(`/v/${ref}`, { error: 'Could not add this car right now. Please try again.' });
  }
  go('/my-cars', { done: result?.status === 'verified' ? 'Your phone number matches the registry record. This car is now in My cars.' : 'Sent to SAZO.' });
}

/** Logbook photo → hash → reserve → bytes → complete → claim. The sign-in never leaves this server. */
export async function sendLogbook(form: FormData) {
  const ref = text(form, 'ref');
  const back = (error: string) => go(`/v/${ref}/claim`, { error });
  const file = form.get('logbook');
  if (!(file instanceof File) || file.size === 0) back('Choose a photo of the logbook.');
  const f = file as File;
  if (!ACCEPTED.includes(f.type)) back('Use a photo (JPEG, PNG) or a PDF.');
  if (f.size > 8_000_000) back('The file must be under 8 MB.');
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const slot = await api<{ evidenceId: string }>('/evidence/uploads', { method: 'POST', auth: true, body: {
      kind: 'official_document', mimeType: f.type, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } });
    await api(`/evidence/uploads/${slot.evidenceId}/content`, { method: 'PUT', auth: true, raw: { bytes, contentType: f.type } });
    await api(`/evidence/${slot.evidenceId}/complete`, { method: 'POST', auth: true });
    await api(`/vehicles/${ref}/ownership-claims`, { method: 'POST', auth: true, body: { logbookEvidenceId: slot.evidenceId } });
  } catch {
    back('The photo could not be sent. Please try again.');
  }
  go('/my-cars', { done: 'Logbook sent. SAZO will check it and text you, usually within 2 working days.' });
}

export async function removeCar(form: FormData) {
  await api(`/me/cars/${text(form, 'ref')}`, { method: 'DELETE', auth: true }).catch(() => undefined);
  go('/my-cars', { done: 'Removed from My cars.' });
}

/** Confirm or dispute a garage visit, as the owner. */
export async function answerVisit(form: FormData) {
  const ref = text(form, 'ref');
  const response = text(form, 'response');
  const comment = text(form, 'comment');
  try {
    await api(`/me/cars/${ref}/visits/${text(form, 'eventId')}`, { method: 'POST', auth: true, body: { response, ...(comment ? { comment } : {}) } });
  } catch (err) {
    go(`/my-cars/${ref}`, { error: err instanceof ApiError && err.detail ? err.detail : 'Could not save your answer. Please try again.' });
  }
  go(`/my-cars/${ref}`, { done: response === 'confirmed' ? 'Thank you — visit confirmed.' : 'Thank you — SAZO will mark this visit as disputed by the owner.' });
}
