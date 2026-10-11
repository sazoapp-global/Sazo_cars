'use server';
import { redirect } from 'next/navigation';
import { ApiError, api, isSignedIn } from '@/lib/api';

export type VerifyState = { error?: string; done?: boolean };

/** Confirm on a button press, not on opening the link: email scanners that open links can't use it up. */
export async function confirmEmail(_prev: VerifyState, form: FormData): Promise<VerifyState> {
  try {
    await api('/auth/email/verify', { method: 'POST', body: { token: String(form.get('token') ?? '') } });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'email_in_use') return { error: 'Another SAZO account already uses this email.' };
    return { error: 'This link has expired or was already used. Ask for a new one in Settings.' };
  }
  if (await isSignedIn()) redirect('/account?done=Your+email+is+confirmed');
  return { done: true };
}
