'use server';
import { redirect } from 'next/navigation';
import { personFrom, type PersonValues } from '@/components/person-fields';
import { ApiError, api } from '@/lib/api';
import { safeNext, toE164 } from '@/lib/phone';
import { afterLogin, clientHeaders, fieldErrors, type LoginResult } from '@/lib/session';

export type EmailSignUpState = { error?: string; errors?: Record<string, string>; values?: PersonValues & { email?: string }; exists?: boolean };
export type PhoneSignUpState =
  | { step: 'details'; error?: string; errors?: Record<string, string>; values?: PersonValues & { phone?: string }; exists?: boolean }
  | { step: 'code'; phone: string; details: ReturnType<typeof personFrom>; error?: string };

function problem(err: unknown): { error: string; errors?: Record<string, string>; exists?: boolean } {
  if (err instanceof ApiError) {
    if (err.code === 'account_exists') return { error: err.detail ?? 'You already have an account.', exists: true };
    if (err.code === 'weak_password') return { error: 'Choose a stronger password.', errors: { password: err.detail ?? 'Choose a stronger password' } };
    if (err.code === 'invalid_request') return { error: 'Check the highlighted fields.', errors: fieldErrors(err.errors) };
    if (err.code === 'too_young') return { error: err.detail ?? 'You must be 18 or older.', errors: { dateOfBirth: err.detail ?? 'You must be 18 or older' } };
    if (err.status === 429) return { error: 'Too many tries. Wait a while and try again.' };
  }
  return { error: 'Something went wrong. Please try again.' };
}

/** Create an account with email and password (D-100, D-101). Logged in at once; a link confirms the email. */
export async function signUpWithEmail(_prev: EmailSignUpState, form: FormData): Promise<EmailSignUpState> {
  const details = personFrom(form);
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const values = { ...details, email };
  if (password !== String(form.get('confirm') ?? '')) return { values, error: 'The two passwords are different.', errors: { confirm: 'Type the same password again' } };
  let to: string;
  try {
    const r = await api<LoginResult>('/auth/signup/email', { method: 'POST', body: { ...details, email, password }, headers: await clientHeaders() });
    to = await afterLogin(r, safeNext(form.get('next')));
  } catch (err) {
    return { values, ...problem(err) };
  }
  redirect(to);
}

/** Create an account with a phone code: details + phone → code (D-100, D-101). */
export async function signUpWithPhone(prev: PhoneSignUpState, form: FormData): Promise<PhoneSignUpState> {
  const intent = String(form.get('intent') ?? '');
  if (intent === 'send' || (intent === 'resend' && prev.step === 'code')) {
    const details = prev.step === 'code' && intent === 'resend' ? prev.details : personFrom(form);
    const raw = prev.step === 'code' && intent === 'resend' ? prev.phone : String(form.get('phone') ?? '');
    const values = { ...details, phone: raw };
    const phone = toE164(raw);
    if (!phone) return { step: 'details', values, error: 'Enter a phone number like 0772 123 456.', errors: { phone: 'Enter a phone number like 0772 123 456' } };
    // Check the details before paying for an SMS: the API checks them again when the code comes back.
    const missing = !details.surname || !details.firstName || !details.gender || !details.dateOfBirth;
    if (missing) return { step: 'details', values, error: 'Fill in your names, gender and date of birth.' };
    try {
      await api('/auth/otp/request', { method: 'POST', body: { phone, intent: 'signup' } });
    } catch (err) {
      return { step: 'details', values, ...problem(err) };
    }
    return { step: 'code', phone, details };
  }
  if (intent === 'verify' && prev.step === 'code') {
    const code = String(form.get('code') ?? '').replace(/\D/g, '');
    if (code.length !== 6) return { ...prev, error: 'Enter the 6-digit code from the SMS.' };
    let to: string;
    try {
      const r = await api<LoginResult>('/auth/otp/verify', { method: 'POST', body: { phone: prev.phone, code, signup: prev.details }, headers: await clientHeaders() });
      to = await afterLogin(r, safeNext(form.get('next')));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return { ...prev, error: 'That code is wrong or has expired. Check the SMS or send a new code.' };
      const p = problem(err);
      return { step: 'details', values: { ...prev.details, phone: prev.phone }, ...p };
    }
    redirect(to);
  }
  if (intent === 'back' && prev.step === 'code') return { step: 'details', values: { ...prev.details, phone: prev.phone } };
  return { step: 'details' };
}
