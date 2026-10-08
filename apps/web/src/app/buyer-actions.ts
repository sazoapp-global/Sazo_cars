'use server';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

const ref = (f: FormData) => String(f.get('ref') ?? '');

export async function saveCar(form: FormData) {
  await api('/me/saved-checks', { method: 'POST', auth: true, body: { vehicleRef: ref(form) } }).catch(() => undefined);
  redirect(`/v/${ref(form)}`);
}

export async function unsaveCar(form: FormData) {
  await api(`/me/saved-checks/${ref(form)}`, { method: 'DELETE', auth: true }).catch(() => undefined);
  redirect(String(form.get('back') ?? `/v/${ref(form)}`));
}

/** Freeze the report and make a share link (30 days). */
export async function shareReport(form: FormData) {
  let token: string | null = null;
  try {
    token = (await api<{ shareToken: string | null }>(`/vehicles/${ref(form)}/snapshots`, { method: 'POST', auth: true, body: { createShareLink: true, expiresInDays: 30 } })).shareToken;
  } catch (err) {
    redirect(`/v/${ref(form)}?error=${encodeURIComponent(err instanceof ApiError ? 'Could not make a link right now.' : 'Something went wrong.')}`);
  }
  redirect(`/shares?new=${token}`);
}

export async function revokeShare(form: FormData) {
  await api(`/me/shares/${String(form.get('id') ?? '')}`, { method: 'DELETE', auth: true }).catch(() => undefined);
  redirect('/shares');
}

export type AddCarState = { error?: string };

/** The not-found flow (D-032, P-010): add the car; it is labelled "not yet confirmed". */
export async function addCar(_prev: AddCarState, form: FormData): Promise<AddCarState> {
  const t = (k: string) => String(form.get(k) ?? '').trim();
  const year = Number(t('year'));
  const body = { ...(t('plate') ? { plate: t('plate').toUpperCase() } : {}), ...(t('vin') ? { vin: t('vin').toUpperCase() } : {}),
    ...(t('chassisNumber') ? { chassisNumber: t('chassisNumber').toUpperCase() } : {}), make: t('make'), model: t('model'), year, ...(t('colour') ? { colour: t('colour') } : {}) };
  if (!body.make || !body.model || !Number.isInteger(year)) return { error: 'Enter the make, model and year.' };
  let vehicleRef: string | null;
  try {
    vehicleRef = (await api<{ vehicleRef: string | null }>('/vehicles/provisional', { method: 'POST', auth: true, body })).vehicleRef;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'vehicle_exists') redirect(`/v/${err.detail?.split(',')[0]}`);
    if (err instanceof ApiError && err.status === 429) return { error: 'You have added several cars today. Try again tomorrow.' };
    if (err instanceof ApiError && err.status === 400) return { error: 'Check the details — a VIN has 17 characters.' };
    return { error: 'Something went wrong. Please try again.' };
  }
  if (!vehicleRef) return { error: 'SAZO needs to check this car before it appears. We will show it once it is matched.' };
  redirect(`/v/${vehicleRef}`);
}

/** A review of the MODEL (D-063); it waits for a SAZO moderator (P-008). */
export async function postReview(form: FormData) {
  const r = ref(form);
  const rating = Number(form.get('rating'));
  const body = String(form.get('body') ?? '').trim();
  const to = (q: string) => redirect(`/v/${r}?${q}#community`);
  if (!(rating >= 1 && rating <= 5)) to('cerror=Choose a rating from 1 to 5.');
  if (body.length < 30) to('cerror=Write at least 30 characters about the model.');
  try {
    await api(`/models/${String(form.get('modelId'))}/reviews`, { method: 'POST', auth: true, body: { rating, body } });
  } catch (err) {
    to(`cerror=${encodeURIComponent(err instanceof ApiError && err.detail ? err.detail : 'Could not send your review.')}`);
  }
  to(`cdone=${encodeURIComponent('Thank you. Your review will appear once SAZO has checked it.')}`);
}

export async function suggestVideo(form: FormData) {
  const r = ref(form);
  const to = (q: string) => redirect(`/v/${r}?${q}#community`);
  try {
    await api(`/models/${String(form.get('modelId'))}/creator-links`, { method: 'POST', auth: true, body: { url: String(form.get('url') ?? '').trim(), ...(String(form.get('title') ?? '').trim() ? { title: String(form.get('title')).trim() } : {}) } });
  } catch (err) {
    to(`cerror=${encodeURIComponent(err instanceof ApiError && err.detail ? err.detail : 'Could not send the link.')}`);
  }
  to(`cdone=${encodeURIComponent('Thank you. The video will appear once SAZO has checked it.')}`);
}
