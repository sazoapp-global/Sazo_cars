'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, ApiError, REFRESH_COOKIE, api } from '@/lib/api';
import { safeNext, toE164 } from '@/lib/phone';
import { REMEMBER_COOKIE, SECOND_STEP_COOKIE, afterLogin, clientHeaders, deviceToken, pendingSecondStep, type LoginResult } from '@/lib/session';

export type PasswordLoginState = { error?: string; email?: string; noAccount?: boolean };
export type PhoneLoginState =
  | { step: 'phone'; error?: string; phoneInput?: string; noAccount?: boolean }
  | { step: 'code'; phone: string; remember: boolean; error?: string };
export type SecondStepState = { error?: string };

const tooMany = 'Too many tries. Wait a while and try again.';
/** "Remember device" (checked by default): stay logged in on this browser after it closes. */
const remembered = (form: FormData) => form.get('remember') === 'on';

/** Log in with email and password (D-100). */
export async function loginWithPassword(_prev: PasswordLoginState, form: FormData): Promise<PasswordLoginState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeNext(form.get('next'));
  if (!email || !password) return { email, error: 'Enter your email and password.' };
  let to: string;
  try {
    const r = await api<LoginResult>('/auth/password/sign-in', { method: 'POST', body: { email, password, deviceToken: await deviceToken() }, headers: await clientHeaders() });
    to = await afterLogin(r, next, remembered(form));
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'no_account') return { email, noAccount: true, error: 'No SAZO account uses this email.' };
      if (err.code === 'invalid_credentials') return { email, error: err.detail ?? 'Wrong email or password.' };
      if (err.code === 'account_locked') return { email, error: err.detail ?? 'Too many wrong passwords. Try again later.' };
      if (err.code === 'account_suspended') return { email, error: 'This account is not active. Contact SAZO.' };
      if (err.status === 400) return { email, error: 'Enter a valid email address.' };
      if (err.status === 429) return { email, error: tooMany };
    }
    return { email, error: 'Something went wrong. Please try again.' };
  }
  redirect(to);
}

/** Log in with a phone code: phone → code (D-100). Numbers with no account are sent to sign up. */
export async function loginWithPhone(prev: PhoneLoginState, form: FormData): Promise<PhoneLoginState> {
  const intent = String(form.get('intent') ?? '');
  const next = safeNext(form.get('next'));

  if (intent === 'send' || intent === 'resend') {
    const raw = intent === 'resend' && prev.step === 'code' ? prev.phone : String(form.get('phone') ?? '');
    const remember = prev.step === 'code' && intent === 'resend' ? prev.remember : remembered(form);
    const phone = toE164(raw);
    if (!phone) return { step: 'phone', phoneInput: raw, error: 'Enter a phone number like 0772 123 456.' };
    try {
      await api('/auth/otp/request', { method: 'POST', body: { phone, intent: 'login' } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'no_account') return { step: 'phone', phoneInput: raw, noAccount: true, error: 'No SAZO account uses this number.' };
      if (err instanceof ApiError && err.status === 429) return { step: 'phone', phoneInput: raw, error: 'Too many codes requested. Wait a while and try again.' };
      return { step: 'phone', phoneInput: raw, error: 'We could not send a code right now. Please try again.' };
    }
    return { step: 'code', phone, remember };
  }

  if (intent === 'verify' && prev.step === 'code') {
    const code = String(form.get('code') ?? '').replace(/\D/g, '');
    if (code.length !== 6) return { ...prev, error: 'Enter the 6-digit code from the SMS.' };
    let to: string;
    try {
      const r = await api<LoginResult>('/auth/otp/verify', { method: 'POST', body: { phone: prev.phone, code, deviceToken: await deviceToken() }, headers: await clientHeaders() });
      to = await afterLogin(r, next, prev.remember);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return { ...prev, error: 'That code is wrong or has expired. Check the SMS or send a new code.' };
      if (err instanceof ApiError && err.code === 'account_suspended') return { ...prev, error: 'This account is not active. Contact SAZO.' };
      return { ...prev, error: 'Something went wrong. Please try again.' };
    }
    redirect(to);
  }
  if (intent === 'back') return { step: 'phone', phoneInput: prev.step === 'code' ? prev.phone : undefined };
  return { step: 'phone' };
}

/** The second step for sensitive roles on a new device (D-105). */
export async function completeSecondStep(_prev: SecondStepState, form: FormData): Promise<SecondStepState> {
  const pending = await pendingSecondStep();
  if (!pending) redirect('/sign-in');
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { error: 'Enter the 6-digit code.' };
  let to: string;
  try {
    const r = await api<LoginResult>('/auth/second-step', {
      method: 'POST', body: { challengeId: pending.challengeId, code, rememberDevice: form.get('remember') === 'on' }, headers: await clientHeaders(),
    });
    to = await afterLogin(r, pending.next, pending.remember ?? true);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { error: 'That code is wrong or has expired. Check it, or log in again for a new code.' };
    return { error: 'Something went wrong. Please try again.' };
  }
  redirect(to);
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  await api('/auth/sign-out', { method: 'POST', auth: true }).catch(() => undefined);
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  jar.delete(REMEMBER_COOKIE);
  jar.delete(SECOND_STEP_COOKIE);
  redirect('/');
}
