'use server';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

export type ResetState = { error?: string };

export async function resetPassword(_prev: ResetState, form: FormData): Promise<ResetState> {
  const token = String(form.get('token') ?? '');
  const password = String(form.get('password') ?? '');
  if (password !== String(form.get('confirm') ?? '')) return { error: 'The two passwords are different.' };
  try {
    await api('/auth/password/reset', { method: 'POST', body: { token, password } });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'weak_password') return { error: err.detail ?? 'Choose a stronger password.' };
    if (err instanceof ApiError && (err.code === 'invalid_link' || err.status === 400)) return { error: 'This link has expired or was already used. Ask for a new one.' };
    return { error: 'Something went wrong. Please try again.' };
  }
  redirect('/sign-in?done=password_reset');
}
