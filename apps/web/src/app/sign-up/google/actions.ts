'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { personFrom, type PersonValues } from '@/components/person-fields';
import { ApiError, api } from '@/lib/api';
import { GOOGLE_SIGNUP_COOKIE, afterLogin, clientHeaders, fieldErrors, type LoginResult } from '@/lib/session';

export type GoogleSignUpState = { error?: string; errors?: Record<string, string>; values?: PersonValues };

export async function finishGoogleSignUp(_prev: GoogleSignUpState, form: FormData): Promise<GoogleSignUpState> {
  const jar = await cookies();
  const raw = jar.get(GOOGLE_SIGNUP_COOKIE)?.value;
  if (!raw) redirect('/sign-up');
  const { signupToken, next } = JSON.parse(raw) as { signupToken: string; next: string };
  const details = personFrom(form);
  let to: string;
  try {
    const r = await api<LoginResult>('/auth/google/complete', { method: 'POST', body: { signupToken, ...details }, headers: await clientHeaders() });
    jar.delete({ name: GOOGLE_SIGNUP_COOKIE, path: '/sign-up' });
    to = await afterLogin(r, next);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'invalid_request') return { values: details, error: 'Check the highlighted fields.', errors: fieldErrors(err.errors) };
    if (err instanceof ApiError && err.code === 'invalid_link') redirect('/sign-up?google=expired');
    if (err instanceof ApiError && err.code === 'account_exists') return { values: details, error: err.detail ?? 'You already have an account. Log in instead.' };
    return { values: details, error: 'Something went wrong. Please try again.' };
  }
  redirect(to);
}
