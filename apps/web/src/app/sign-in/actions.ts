'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, ApiError, REFRESH_COOKIE, api } from '@/lib/api';
import { safeNext, toE164 } from '@/lib/phone';

export type SignInState =
  | { step: 'phone'; error?: string; phoneInput?: string }
  | { step: 'code'; phone: string; error?: string }
  | { step: 'name'; phone: string; code: string; error?: string };

const secure = process.env.NODE_ENV === 'production';

async function storeTokens(t: { accessToken: string; refreshToken: string; expiresIn: number }) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, t.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: t.expiresIn });
  jar.set(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 86400 });
}

/** One action for the three small steps: phone → code → (first time only) name. */
export async function signIn(prev: SignInState, form: FormData): Promise<SignInState> {
  const intent = String(form.get('intent') ?? '');
  const next = safeNext(form.get('next'));

  if (intent === 'send' || intent === 'resend') {
    const raw = intent === 'resend' && prev.step !== 'phone' ? prev.phone : String(form.get('phone') ?? '');
    const phone = toE164(raw);
    if (!phone) return { step: 'phone', phoneInput: raw, error: 'Enter a phone number like 0772 123 456.' };
    try {
      await api('/auth/otp/request', { method: 'POST', body: { phone } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) return { step: 'phone', phoneInput: raw, error: 'Too many codes requested. Wait a while and try again.' };
      return { step: 'phone', phoneInput: raw, error: 'We could not send a code right now. Please try again.' };
    }
    return { step: 'code', phone };
  }

  if (intent === 'verify' && prev.step !== 'phone') {
    const code = prev.step === 'name' ? prev.code : String(form.get('code') ?? '').replace(/\D/g, '');
    const displayName = String(form.get('displayName') ?? '').trim() || undefined;
    if (prev.step === 'code' && code.length !== 6) return { ...prev, error: 'Enter the 6-digit code from the SMS.' };
    if (prev.step === 'name' && !displayName) return { ...prev, error: 'Tell us your name.' };
    try {
      await storeTokens(await api('/auth/otp/verify', { method: 'POST', body: { phone: prev.phone, code, displayName } }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'display_name_required') return { step: 'name', phone: prev.phone, code };
      if (err instanceof ApiError && err.status === 401) return { step: 'code', phone: prev.phone, error: 'That code is wrong or has expired. Check the SMS or send a new code.' };
      return { ...prev, error: 'Something went wrong. Please try again.' };
    }
    redirect(next);
  }
  return { step: 'phone' };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  await api('/auth/sign-out', { method: 'POST', auth: true }).catch(() => undefined);
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect('/');
}
