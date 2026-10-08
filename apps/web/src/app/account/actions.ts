'use server';
// Account settings: every change goes through the API with the signed-in person's token.
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, ApiError, REFRESH_COOKIE, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (q: Record<string, string>): never => redirect(`/account?${new URLSearchParams(q)}`);
const why = (err: unknown, fallback: string) => (err instanceof ApiError && err.detail ? err.detail : fallback);

export async function rename(form: FormData) {
  const name = text(form, 'name');
  if (name.length < 2) back({ error: 'Your name must be at least 2 characters.' });
  try { await api('/me', { method: 'PATCH', auth: true, body: { displayName: name } }); } catch (err) { back({ error: why(err, 'Could not change your name.') }); }
  revalidatePath('/', 'layout'); // the name in the header
  back({ done: 'Name changed.' });
}

/** Step 1: send a code to the NEW number. */
export async function sendPhoneCode(form: FormData) {
  const phone = toE164(text(form, 'phone'));
  if (!phone) back({ error: 'Check the new number — e.g. 0772 123 456.' });
  try { await api('/me/phone/code', { method: 'POST', auth: true, body: { phone } }); } catch (err) { back({ error: why(err, 'Could not send a code.') }); }
  back({ newPhone: phone! });
}

/** Step 2: the code proves the person has the new phone. */
export async function confirmPhone(form: FormData) {
  const phone = text(form, 'phone');
  const code = text(form, 'code').replace(/\D/g, '');
  try { await api('/me/phone', { method: 'POST', auth: true, body: { phone, code } }); } catch (err) {
    back({ newPhone: phone, error: why(err, 'That code did not work.') });
  }
  back({ done: 'Your account now uses your new number. Other devices have been signed out.' });
}

export async function setTexts(form: FormData) {
  const on = form.get('visitTexts') === 'on';
  await api('/me/preferences', { method: 'PUT', auth: true, body: { visitConfirmationTexts: on } }).catch(() => undefined);
  back({ done: on ? 'Garages can ask you by text to confirm visits.' : 'You will not get texts asking you to confirm garage visits.' });
}

export async function signOutDevice(form: FormData) {
  await api(`/me/sessions/${text(form, 'id')}`, { method: 'DELETE', auth: true }).catch(() => undefined);
  back({ done: 'That device has been signed out.' });
}

export async function signOutOthers() {
  await api('/me/sessions/sign-out-others', { method: 'POST', auth: true }).catch(() => undefined);
  back({ done: 'All your other devices have been signed out.' });
}

export async function deleteAccount(form: FormData) {
  if (text(form, 'confirm') !== 'DELETE') back({ error: 'Type DELETE in capitals to confirm.' });
  try { await api('/me', { method: 'DELETE', auth: true, body: { confirm: 'DELETE' } }); } catch (err) { back({ error: why(err, 'Could not delete your account.') }); }
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect('/?deleted=1');
}
