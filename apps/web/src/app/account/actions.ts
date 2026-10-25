'use server';
// Account settings: every change goes through the API with the signed-in person's token.
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, ApiError, REFRESH_COOKIE, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
/**
 * Back to where Settings was opened (the form's `back`, a path on this site), with the outcome in the query.
 * Anything that is not a plain path here falls back to /account.
 */
const back = (f: FormData, q: Record<string, string>): never => {
  const b = String(f.get('back') ?? '');
  const returnTo = /^\/(?![/\\])[^\s]*$/.test(b) ? b : '/account';
  const [path, query = ''] = returnTo.split('?');
  const p = new URLSearchParams(query);
  for (const k of ['done', 'error', 'newPhone']) p.delete(k);
  for (const [k, v] of Object.entries(q)) p.set(k, v);
  redirect(`${path}?${p}`);
};
const why = (err: unknown, fallback: string) => (err instanceof ApiError && err.detail ? err.detail : fallback);

/** Names (D-103): shown everywhere as "Surname M. First"; the change is recorded. */
export async function rename(form: FormData) {
  const body = { surname: text(form, 'surname'), firstName: text(form, 'firstName'), middleName: text(form, 'middleName') };
  try { await api('/me', { method: 'PATCH', auth: true, body }); } catch (err) { back(form, { error: why(err, 'Could not change your names.') }); }
  revalidatePath('/', 'layout'); // the name in the header
  back(form, { done: 'Names saved.' });
}

/** Add or change the email: saved once the emailed link is opened. */
export async function setEmail(form: FormData) {
  const email = text(form, 'email');
  try { await api('/me/email', { method: 'POST', auth: true, body: { email } }); } catch (err) { back(form, { error: why(err, 'Could not send the link.') }); }
  back(form, { done: `We sent a link to ${email}. Open it to confirm your email.` });
}

/** Set a password (phone and Google accounts), or change it (needs the current one). */
export async function setPassword(form: FormData) {
  const newPassword = String(form.get('newPassword') ?? '');
  if (newPassword !== String(form.get('confirmPassword') ?? '')) back(form, { error: 'The two new passwords are different.' });
  try {
    await api('/me/password', { method: 'PUT', auth: true, body: { currentPassword: String(form.get('currentPassword') ?? '') || undefined, newPassword } });
  } catch (err) { back(form, { error: why(err, 'Could not save the password.') }); }
  back(form, { done: 'Password saved.' });
}

/** Step 1: send a code to the NEW number. */
export async function sendPhoneCode(form: FormData) {
  const phone = toE164(text(form, 'phone'));
  if (!phone) back(form, { error: 'Check the new number, for example 0772 123 456.' });
  try { await api('/me/phone/code', { method: 'POST', auth: true, body: { phone } }); } catch (err) { back(form, { error: why(err, 'Could not send a code.') }); }
  back(form, { newPhone: phone! });
}

/** Step 2: the code proves the person has the new phone. */
export async function confirmPhone(form: FormData) {
  const phone = text(form, 'phone');
  const code = text(form, 'code').replace(/\D/g, '');
  try { await api('/me/phone', { method: 'POST', auth: true, body: { phone, code } }); } catch (err) {
    back(form, { newPhone: phone, error: why(err, 'That code did not work.') });
  }
  back(form, { done: 'Your account now uses your new number. Other devices have been signed out.' });
}

export async function setTexts(form: FormData) {
  const on = form.get('visitTexts') === 'on';
  await api('/me/preferences', { method: 'PUT', auth: true, body: { visitConfirmationTexts: on } }).catch(() => undefined);
  back(form, { done: on ? 'Garages can ask you by text to confirm visits.' : 'You will not get texts asking you to confirm garage visits.' });
}

export async function signOutDevice(form: FormData) {
  await api(`/me/sessions/${text(form, 'id')}`, { method: 'DELETE', auth: true }).catch(() => undefined);
  back(form, { done: 'That device has been signed out.' });
}

export async function signOutOthers(form: FormData) {
  await api('/me/sessions/sign-out-others', { method: 'POST', auth: true }).catch(() => undefined);
  back(form, { done: 'All your other devices have been signed out.' });
}

export async function deleteAccount(form: FormData) {
  if (text(form, 'confirm') !== 'DELETE') back(form, { error: 'Type DELETE in capitals to confirm.' });
  try { await api('/me', { method: 'DELETE', auth: true, body: { confirm: 'DELETE' } }); } catch (err) { back(form, { error: why(err, 'Could not delete your account.') }); }
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect('/?deleted=1');
}
