'use server';
// "My cars" (O-007): prove a car is yours by phone match, or by a logbook photo a SAZO reviewer checks.
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { UnreadablePicture, isPictureOrPdf, uploadEvidence } from '@/lib/upload';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const go = (path: string, q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);

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

/** Logbook photo (JPEG, PNG or PDF; other pictures become JPEG) → evidence → claim. The sign-in never leaves this server. */
export async function sendLogbook(form: FormData) {
  const ref = text(form, 'ref');
  const back = (error: string) => go(`/v/${ref}/claim`, { error });
  const file = form.get('logbook');
  if (!(file instanceof File) || file.size === 0) back('Choose a photo of the logbook.');
  const f = file as File;
  if (!isPictureOrPdf(f)) back('Use a JPEG or PNG photo, or a PDF.');
  if (f.size > 8_000_000) back('The file must be under 8 MB.');
  let problem: string | undefined;
  try {
    const { id } = await uploadEvidence(f, 'official_document');
    await api(`/vehicles/${ref}/ownership-claims`, { method: 'POST', auth: true, body: { logbookEvidenceId: id } });
  } catch (err) {
    problem = err instanceof UnreadablePicture ? err.message : 'The photo could not be sent. Please try again.';
  }
  if (problem) back(problem);
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
  go(`/my-cars/${ref}`, { done: response === 'confirmed' ? 'Thank you. Visit confirmed.' : 'Thank you. SAZO will mark this visit as disputed by the owner.' });
}

/** The fuel log (D-148): a fill-up from the confirmed owner. */
export async function addFillup(form: FormData) {
  const ref = text(form, 'ref');
  const back = (q: Record<string, string>): never => go(`/my-cars/${ref}/fuel`, q);
  const litres = Number(text(form, 'litres').replace(/[,\s]/g, ''));
  const odometerKm = Number(text(form, 'odometerKm').replace(/[,\s]/g, ''));
  if (!(litres > 0 && litres <= 1000)) back({ error: 'Enter the litres, for example 38.5.' });
  if (!Number.isInteger(odometerKm) || odometerKm < 0) back({ error: 'Enter the mileage in km, for example 132410.' });
  try {
    await api(`/me/cars/${ref}/fuel`, { method: 'POST', auth: true, body: { filledOn: text(form, 'filledOn'), litres: Math.round(litres * 100) / 100, odometerKm, fullTank: text(form, 'fullTank') !== 'no' } });
  } catch (err) {
    back({ error: err instanceof ApiError && err.detail ? err.detail : 'Could not save the fill-up. Please try again.' });
  }
  back({ done: 'Fill-up saved.' });
}

export async function removeFillup(form: FormData) {
  const ref = text(form, 'ref');
  await api(`/me/cars/${ref}/fuel/${text(form, 'id')}`, { method: 'DELETE', auth: true }).catch(() => undefined);
  go(`/my-cars/${ref}/fuel`, { done: 'Fill-up removed.' });
}
