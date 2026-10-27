// Server code only: the phone being confirmed straight after an email sign-up (27 Oct 2026).
import { cookies } from 'next/headers';

/** The number being confirmed after an email sign-up, and where to go next; kept in a private cookie, never in the address. */
export const SIGNUP_PHONE_COOKIE = 'sazo_signup_phone';
export type SignUpPhone = { to: string; phone?: string; phoneInput?: string; error?: string };

export async function keepSignUpPhone(v: SignUpPhone) {
  (await cookies()).set(SIGNUP_PHONE_COOKIE, JSON.stringify(v), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 60 });
}
export async function signUpPhone(): Promise<SignUpPhone | undefined> {
  try { return JSON.parse((await cookies()).get(SIGNUP_PHONE_COOKIE)?.value ?? 'null') ?? undefined; } catch { return undefined; }
}

