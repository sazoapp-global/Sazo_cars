// Server-side calls to the SAZO API. Runs only on the Next.js server (tokens never reach browser JavaScript).
import { cookies } from 'next/headers';

export const API_URL = process.env.SAZO_API_URL ?? 'http://localhost:3000';
export const ACCESS_COOKIE = 'sazo_at';
export const REFRESH_COOKIE = 'sazo_rt';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail?: string, readonly errors?: unknown[]) {
    super(detail ?? code);
  }
}

export async function accessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function isSignedIn(): Promise<boolean> {
  return !!(await accessToken());
}

/** Call the API. `auth: true` sends the signed-in user's access token. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth) {
    const token = await accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.code ?? `http_${res.status}`, data?.detail, data?.errors);
  return data as T;
}
