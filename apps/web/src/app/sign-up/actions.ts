'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { personFrom, type PersonValues } from '@/components/person-fields';
import { ApiError, api } from '@/lib/api';
import { safeNext, toE164 } from '@/lib/phone';
import { SIGNUP_PHONE_COOKIE, keepSignUpPhone, signUpPhone } from './phone-cookie';
import { afterLogin, clientHeaders, fieldErrors, type LoginResult } from '@/lib/session';

export type EmailSignUpState = { error?: string; errors?: Record<string, string>; values?: PersonValues & { email?: string; phone?: string }; exists?: boolean };
/** Straight after an email sign-up: the account is made and signed in; its mobile number is still to be confirmed. */
export type SignUpPhoneState = { step: 'phone'; phoneInput?: string; error?: string } | { step: 'code'; phone: string; error?: string };
export type PhoneSignUpState =
  | { step: 'details'; error?: string; errors?: Record<string, string>; values?: PersonValues & { phone?: string }; exists?: boolean }
  | { step: 'code'; phone: string; details: ReturnType<typeof personFrom>; remember: boolean; error?: string };

const remembered = (form: FormData) => form.get('remember') === 'on';

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

/**
 * Create an account with email and password (D-100, D-101), then confirm the mobile number in the same go
 * (/sign-up/phone): SAZO uses the phone for the second step on new devices and for resets (D-145), so leaving it
 * for later would stop the first log-in. Logged in at once; a link confirms the email.
 */
export async function signUpWithEmail(_prev: EmailSignUpState, form: FormData): Promise<EmailSignUpState> {
  const details = personFrom(form);
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const phoneInput = String(form.get('phone') ?? '').trim();
  const values = { ...details, email, phone: phoneInput };
  const phone = toE164(phoneInput);
  if (!phone) return { values, error: 'Check the highlighted fields.', errors: { phone: phoneInput ? 'Check the number, for example 0772 123 456' : 'Enter your mobile number' } };
  if (password !== String(form.get('confirm') ?? '')) return { values, error: 'The two passwords are different.', errors: { confirm: 'Type the same password again' } };
  let r: LoginResult;
  let to: string;
  try {
    r = await api<LoginResult>('/auth/signup/email', { method: 'POST', body: { ...details, email, password }, headers: await clientHeaders() });
    to = await afterLogin(r, safeNext(form.get('next')), remembered(form));
  } catch (err) {
    return { values, ...problem(err) };
  }
  if (r.status !== 'signed_in') redirect(to);
  try {
    await api('/me/phone/code', { method: 'POST', body: { phone }, headers: { Authorization: `Bearer ${r.accessToken}` } });
    await keepSignUpPhone({ to, phone });
  } catch (err) {
    await keepSignUpPhone({ to, phoneInput, error: phoneProblem(err) }); // the account is made; the number can be fixed there
  }
  redirect('/sign-up/phone');
}

/** The steps of /sign-up/phone: send a code to the number, confirm it, or leave it for the next log-in. */
export async function confirmSignUpPhone(prev: SignUpPhoneState, form: FormData): Promise<SignUpPhoneState> {
  const kept = await signUpPhone();
  const to = kept?.to ?? '/';
  const intent = String(form.get('intent') ?? '');
  const done = async () => { (await cookies()).delete(SIGNUP_PHONE_COOKIE); redirect(to); };
  if (intent === 'later') return done();
  if (prev.step === 'code' && intent === 'back') return { step: 'phone', phoneInput: prev.phone.replace(/^\+256/, '0') };
  if (prev.step === 'phone' || intent === 'resend') {
    const raw = prev.step === 'phone' ? String(form.get('phone') ?? '') : prev.phone;
    const phone = toE164(raw);
    if (!phone) return { step: 'phone', phoneInput: raw, error: 'Check the number, for example 0772 123 456.' };
    try { await api('/me/phone/code', { method: 'POST', auth: true, body: { phone } }); } catch (err) {
      return { step: 'phone', phoneInput: raw, error: phoneProblem(err) };
    }
    await keepSignUpPhone({ to, phone });
    return { step: 'code', phone };
  }
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { ...prev, error: 'Enter the 6-digit code from the SMS.' };
  try { await api('/me/phone', { method: 'POST', auth: true, body: { phone: prev.phone, code } }); } catch (err) {
    return { ...prev, error: err instanceof ApiError && err.status === 401 ? 'That code is wrong or has expired. Check the SMS or send a new code.' : phoneProblem(err) };
  }
  return done();
}

function phoneProblem(err: unknown): string {
  if (err instanceof ApiError && (err.code === 'phone_in_use' || err.status === 409)) return err.detail ?? 'Another SAZO account uses this number.';
  if (err instanceof ApiError && err.status === 429) return 'Too many codes. Wait a while and try again.';
  if (err instanceof ApiError && err.detail) return err.detail;
  return 'Could not send a code. Check the number and try again.';
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
    return { step: 'code', phone, details, remember: prev.step === 'code' && intent === 'resend' ? prev.remember : remembered(form) };
  }
  if (intent === 'verify' && prev.step === 'code') {
    const code = String(form.get('code') ?? '').replace(/\D/g, '');
    if (code.length !== 6) return { ...prev, error: 'Enter the 6-digit code from the SMS.' };
    let to: string;
    try {
      const r = await api<LoginResult>('/auth/otp/verify', { method: 'POST', body: { phone: prev.phone, code, signup: prev.details }, headers: await clientHeaders() });
      to = await afterLogin(r, safeNext(form.get('next')), prev.remember);
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
