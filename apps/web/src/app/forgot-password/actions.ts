'use server';
import { ApiError, api } from '@/lib/api';

export type ForgotState = { sent?: boolean; error?: string; email?: string };

/** Always says the same thing, whether or not the email has an account. */
export async function forgotPassword(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  const email = String(form.get('email') ?? '').trim();
  try {
    await api('/auth/password/forgot', { method: 'POST', body: { email } });
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return { email, error: 'Enter a valid email address.' };
    return { email, error: 'Something went wrong. Please try again.' };
  }
  return { sent: true, email };
}
