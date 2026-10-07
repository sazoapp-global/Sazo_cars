// Calls to the SAZO API (same origin, /v1). The access token lives only in memory; the refresh token is
// kept on the phone so the mechanic stays signed in between days. 401 → refresh once → retry.
import { kv } from './db';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: string, readonly errors: unknown[] = []) {
    super(detail ?? code);
  }
}
/** No signal. Work continues on the phone and syncs later. */
export class OfflineError extends Error {
  constructor() { super('offline'); }
}

interface Tokens { accessToken: string; refreshToken: string; expiresIn: number }
let access: string | undefined;
let refreshing: Promise<boolean> | undefined;
const listeners = new Set<(signedIn: boolean) => void>();
export const onAuthChange = (fn: (signedIn: boolean) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

async function raw(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`/v1${path}`, init);
  } catch {
    throw new OfflineError();
  }
}

async function store(t: Tokens): Promise<void> {
  access = t.accessToken;
  await kv.set('refreshToken', t.refreshToken);
}

/** Swap the refresh token for new tokens. Only one refresh runs at a time. */
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const token = await kv.get<string>('refreshToken');
      if (!token) return false;
      const res = await raw('/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) });
      if (res.status === 409) { await new Promise((r) => setTimeout(r, 600)); return !!access; } // another tab refreshed
      if (!res.ok) {
        await kv.del('refreshToken');
        access = undefined;
        listeners.forEach((l) => l(false));
        return false;
      }
      await store(await res.json());
      return true;
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}

export async function request<T>(path: string, opts: { method?: string; body?: unknown; org?: string; headers?: Record<string, string>; rawBody?: Blob } = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
    if (access) headers.Authorization = `Bearer ${access}`;
    if (opts.org) headers['X-Organisation-Id'] = opts.org;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    return raw(path, { method: opts.method ?? 'GET', headers, body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) });
  };
  let res = await send();
  if (res.status === 401 && (await refresh())) res = await send();
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.code ?? `http_${res.status}`, data?.detail, data?.errors ?? []);
  return data as T;
}

export async function requestCode(phone: string): Promise<void> {
  await request('/auth/otp/request', { method: 'POST', body: { phone } });
}

export async function verifyCode(phone: string, code: string, displayName?: string): Promise<void> {
  await store(await request<Tokens>('/auth/otp/verify', { method: 'POST', body: { phone, code, displayName } }));
  listeners.forEach((l) => l(true));
}

export async function signOut(): Promise<void> {
  await request('/auth/sign-out', { method: 'POST' }).catch(() => undefined);
  access = undefined;
}

/** On start: signed in if a refresh token is stored (works offline too — the API is asked when there's signal). */
export async function restoreSession(): Promise<'signed_in' | 'signed_out' | 'offline_signed_in'> {
  if (!(await kv.get<string>('refreshToken'))) return 'signed_out';
  try {
    return (await refresh()) ? 'signed_in' : 'signed_out';
  } catch (err) {
    if (err instanceof OfflineError) return 'offline_signed_in';
    throw err;
  }
}
