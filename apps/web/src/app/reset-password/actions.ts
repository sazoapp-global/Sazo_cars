'use server';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

/** A reset needs the emailed link AND a code texted to the account's phone (D-145). */
export type ResetState =
  | { step: 'start'; error?: string; noPhone?: boolean }
  | { step: 'code'; sentTo: string; error?: string };

const expired = 'This link has expired or was already used. Ask for a new one.';

export async function resetPassword(prev: ResetState, form: FormData): Promise<ResetState> {
  const token = String(form.get('token') ?? '');
  const intent = String(form.get('intent') ?? '');
  if (intent === 'send' || intent === 'resend') {
    try {
      const r = await api<{ sentTo: string }>('/auth/password/reset/code', { method: 'POST', body: { token } });
      return { step: 'code', sentTo: r.sentTo };
    } catch (err) {
      const back = prev.step === 'code' ? prev : { step: 'start' as const };
      if (err instanceof ApiError && err.code === 'phone_required') return { step: 'start', noPhone: true };
      if (err instanceof ApiError && (err.code === 'invalid_link' || err.status === 400)) return { ...back, error: expired };
      if (err instanceof ApiError && err.status === 429) return { ...back, error: 'Too many codes requested. Wait a while and try again.' };
      return { ...back, error: 'We could not send a code right now. Please try again.' };
    }
  }
  if (prev.step !== 'code') return prev;
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  const password = String(form.get('password') ?? '');
  if (code.length !== 6) return { ...prev, error: 'Enter the 6-digit code from the SMS.' };
  if (password !== String(form.get('confirm') ?? '')) return { ...prev, error: 'The two passwords are different.' };
  try {
    await api('/auth/password/reset', { method: 'POST', body: { token, code, password } });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'invalid_code') return { ...prev, error: 'That code is wrong or has expired. Check the SMS or send a new code.' };
    if (err instanceof ApiError && err.code === 'weak_password') return { ...prev, error: err.detail ?? 'Choose a stronger password.' };
    if (err instanceof ApiError && (err.code === 'invalid_link' || err.status === 400)) return { ...prev, error: expired };
    return { ...prev, error: 'Something went wrong. Please try again.' };
  }
  redirect('/sign-in?done=password_reset');
}
