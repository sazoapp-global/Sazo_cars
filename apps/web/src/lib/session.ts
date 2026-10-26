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
/** Before going in (D-145): add a phone, or set up the authenticator app; then the backup codes, shown once. */
export const SETUP_COOKIE = 'sazo_setup';
export const BACKUP_COOKIE = 'sazo_bk';
export const TOTP_KEY_COOKIE = 'sazo_totp';
const secure = process.env.NODE_ENV === 'production';

export type SecondStepChannel = 'sms' | 'email' | 'authenticator' | 'password';
export type LoginResult =
  | { status: 'signed_in'; accessToken: string; refreshToken: string; expiresIn: number; deviceToken?: string; created: boolean; backupCodes?: string[] }
  | { status: 'second_step'; challengeId: string; channel: SecondStepChannel; sentTo?: string }
  | { status: 'add_phone'; setupToken: string }
  | { status: 'setup_authenticator'; setupToken: string };

export interface SecondStepPending { challengeId: string; channel: SecondStepChannel; sentTo?: string; next: string; remember?: boolean }
export interface SetupPending { kind: 'add_phone' | 'setup_authenticator'; setupToken: string; next: string; remember?: boolean }

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
  if (r.status === 'add_phone' || r.status === 'setup_authenticator') {
    const pending: SetupPending = { kind: r.status, setupToken: r.setupToken, next: safeNext(next), remember };
    jar.set(SETUP_COOKIE, JSON.stringify(pending), { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 15 * 60 });
    jar.delete(SECOND_STEP_COOKIE);
    return r.status === 'add_phone' ? '/sign-in/add-phone' : '/sign-in/authenticator';
  }
  await storeTokens(r, remember);
  jar.delete(SECOND_STEP_COOKIE);
  jar.delete(SETUP_COOKIE);
  const auth = { headers: { Authorization: `Bearer ${r.accessToken}` } };
  const me = await api<{ needsDetails: string[] }>('/me', auth).catch(() => undefined);
  // A brand-new account with nowhere particular to go: ask what brought them (the design's onboarding step).
  // A dealer with nowhere particular to go lands in their dealer console (25 Oct 2026).
  let to = r.created && safeNext(next) === '/' ? '/welcome' : safeNext(next);
  if (to === '/') {
    const orgs = await api<{ id: string; type: string; status: string }[]>('/me/organisations', auth).catch(() => []);
    const dealer = orgs.find((o) => o.type === 'dealer' && (o.status === 'approved' || o.status === 'pending_verification'));
    if (dealer) to = `/dealer/${dealer.id}${dealer.status === 'approved' ? '/dashboard' : ''}`; // the dashboard once approved (D-146)
  }
  const then = me?.needsDetails.length ? `/account/complete?next=${encodeURIComponent(to)}` : to;
  if (r.backupCodes?.length) {
    // Shown once on the next page, then forgotten.
    jar.set(BACKUP_COOKIE, JSON.stringify(r.backupCodes), { httpOnly: true, sameSite: 'strict', secure, path: '/sign-in/backup-codes', maxAge: 10 * 60 });
    return `/sign-in/backup-codes?next=${encodeURIComponent(then)}`;
  }
  return then;
}

export async function pendingSetup(kind: SetupPending['kind']): Promise<SetupPending | undefined> {
  const raw = (await cookies()).get(SETUP_COOKIE)?.value;
  try {
    const p = raw ? (JSON.parse(raw) as SetupPending) : undefined;
    return p?.kind === kind ? p : undefined;
  } catch {
    return undefined;
  }
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

/** The authenticator key being set up (the same QR code after a refresh), until the first code confirms it. */
export async function authenticatorKey(): Promise<{ secret: string; otpauthUrl: string } | undefined> {
  const raw = (await cookies()).get(TOTP_KEY_COOKIE)?.value;
  try {
    return raw ? (JSON.parse(raw) as { secret: string; otpauthUrl: string }) : undefined;
  } catch {
    return undefined;
  }
}

/** Backup codes just made, to show once. */
export async function freshBackupCodes(): Promise<string[] | undefined> {
  const raw = (await cookies()).get(BACKUP_COOKIE)?.value;
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : undefined;
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : undefined;
  } catch {
    return undefined;
  }
}
