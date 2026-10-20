'use server';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** I-07: ask an inspector to check a car. */
export async function requestBooking(form: FormData) {
  const ref = str(form, 'ref');
  const back = (error: string) => `/inspections/book?${new URLSearchParams({ ...(ref ? { ref } : {}), plate: str(form, 'plate'), error })}`;
  let target = '/inspections?booked=1';
  try {
    await api('/bookings', {
      method: 'POST', auth: true,
      body: {
        organisationId: str(form, 'organisationId'), plate: str(form, 'plate'), preferredDate: str(form, 'preferredDate'),
        ...(ref ? { vehicleRef: ref } : {}), ...(str(form, 'place') ? { place: str(form, 'place') } : {}), ...(str(form, 'note') ? { note: str(form, 'note') } : {}),
      },
    });
  } catch (err) {
    target = back(err instanceof ApiError ? (err.status === 429 ? (err.detail ?? 'Too many requests today.') : err.status === 404 ? 'Choose an inspector from the list.' : (err.detail ?? 'Check the details and try again.')) : 'Could not send. Try again.');
  }
  redirect(target);
}

export async function cancelBooking(form: FormData) {
  await api(`/me/bookings/${encodeURIComponent(str(form, 'id'))}/cancel`, { method: 'POST', auth: true }).catch(() => undefined);
  redirect('/inspections');
}
