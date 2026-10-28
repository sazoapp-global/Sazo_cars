'use server';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** I-07: ask an inspector to check a car. */
export async function requestBooking(form: FormData) {
  const ref = str(form, 'ref');
  // From a car's report inside a workspace (28 Oct 2026): come back there, with a note or the problem.
  const from = str(form, 'back');
  const inWorkspace = /^\/(dealer|admin|partner)\/[^\s\\]*$/.test(from) && !from.startsWith('//');
  const at = (q: Record<string, string>) => { const u = new URL(from, 'http://x'); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v); return `${u.pathname}${u.search}`; };
  const back = (error: string) => inWorkspace ? at({ bookError: error }) : `/inspections/book?${new URLSearchParams({ ...(ref ? { ref } : {}), plate: str(form, 'plate'), error })}`;
  let target = inWorkspace ? at({ booked: '1' }) : '/inspections?booked=1';
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
