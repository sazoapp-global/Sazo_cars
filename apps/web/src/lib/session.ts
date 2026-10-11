// Server-only helpers for logging in (D-100, D-105): store tokens in httpOnly cookies, remember a device
// that passed the second step, and decide where to go next (finish details first if an account needs it).
import { cookies, headers } from 'next/headers';
import { ACCESS_COOKIE, REFRESH_COOKIE, api } from '@/lib/api';
import { safeNext } from '@/lib/phone';

export const DEVICE_COOKIE = 'sazo_dev';
export const SECOND_STEP_COOKIE = 'sazo_2fa';
export const GOOGLE_COOKIE = 'sazo_g';
export const GOOGLE_SIGNUP_COOKIE = 'sazo_gs';
export const REMEMBER_COOKIE = 'sazo_rm';
const secure = process.env.NODE_ENV === 'production';

export type LoginResult =
  | { status: 'signed_in'; accessToken: string; refreshToken: string; expiresIn: number; deviceToken?: string; created: boolean }
  | { status: 'second_step'; challengeId: string; channel: 'sms' | 'email'; sentTo: string };

export interface SecondStepPending { challengeId: string; channel: 'sms' | 'email'; sentTo: string; next: string; remember?: boolean }

/** The browser's description and address, passed on so "Signed-in devices" and the log-in record are right. */
export async function clientHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  const out: Record<string, string> = {};
  const ua = h.get('user-agent')?.slice(0, 300);
  if (ua) out['User-Agent'] = ua;
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
  if (ip) out['X-Forwarded-For'] = ip;
  return out;
}

export async function deviceToken(): Promise<string | undefined> {
  return (await cookies()).get(DEVICE_COOKIE)?.value;
}

/** `remember: false` = logged out when the browser closes (cookies without an expiry). */
export async function storeTokens(t: { accessToken: string; refreshToken: string; expiresIn: number; deviceToken?: string }, remember = true) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, t.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', ...(remember ? { maxAge: t.expiresIn } : {}) });
  jar.set(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', ...(remember ? { maxAge: 30 * 86400 } : {}) });
  jar.set(REMEMBER_COOKIE, remember ? '1' : '0', { httpOnly: true, sameSite: 'lax', secure, path: '/', ...(remember ? { maxAge: 30 * 86400 } : {}) });
  if (t.deviceToken) jar.set(DEVICE_COOKIE, t.deviceToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 90 * 86400 });
}

/**
 * After a log-in call: tokens → stored, and the page to go to (finish details first when needed);
 * second step → remembered in a short cookie and the code page is next.
 */
export async function afterLogin(r: LoginResult, next: string, remember = true): Promise<string> {
  const jar = await cookies();
  if (r.status === 'second_step') {
    const pending: SecondStepPending = { challengeId: r.challengeId, channel: r.channel, sentTo: r.sentTo, next: safeNext(next), remember };
    jar.set(SECOND_STEP_COOKIE, JSON.stringify(pending), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 10 * 60 });
    return '/sign-in/verify';
  }
  await storeTokens(r, remember);
  jar.delete(SECOND_STEP_COOKIE);
  const me = await api<{ needsDetails: string[] }>('/me', { headers: { Authorization: `Bearer ${r.accessToken}` } }).catch(() => undefined);
  // A brand-new account with nowhere particular to go: ask what brought them (the design's onboarding step).
  const to = r.created && safeNext(next) === '/' ? '/welcome' : safeNext(next);
  return me?.needsDetails.length ? `/account/complete?next=${encodeURIComponent(to)}` : to;
}

export async function pendingSecondStep(): Promise<SecondStepPending | undefined> {
  const raw = (await cookies()).get(SECOND_STEP_COOKIE)?.value;
  try {
    return raw ? (JSON.parse(raw) as SecondStepPending) : undefined;
  } catch {
    return undefined;
  }
}

/** Is Google sign-in switched on in the API? (The button is hidden until the keys are set.) */
export async function googleEnabled(): Promise<boolean> {
  return api<{ enabled: boolean }>('/auth/google').then((r) => r.enabled).catch(() => false);
}

/** Field errors from the API ("surname: Required") → { surname: 'Required' }. */
export function fieldErrors(errors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of (Array.isArray(errors) ? errors : []) as { path?: string; message?: string }[]) {
    const key = (e.path ?? '').split('.').at(-1) || '_';
    if (e.message && !out[key]) out[key] = e.message;
  }
  return out;
}
