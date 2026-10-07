// Keeps people signed in: before a page renders, swap an expiring access token for a fresh one using the
// refresh token (both in httpOnly cookies). The rotated tokens go to the browser and to this render.
import { NextResponse, type NextRequest } from 'next/server';
import { secondsLeft } from './lib/jwt';

const API_URL = process.env.SAZO_API_URL ?? 'http://localhost:3000';
const secure = process.env.NODE_ENV === 'production';

export async function proxy(request: NextRequest) {
  const access = request.cookies.get('sazo_at')?.value;
  const refresh = request.cookies.get('sazo_rt')?.value;
  // Prefetches never refresh: only real navigations do, so one browser doesn't race itself.
  if (request.headers.get('next-router-prefetch') || !refresh || secondsLeft(access) > 60) return NextResponse.next();

  const res = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }), cache: 'no-store',
  }).catch(() => undefined);

  if (!res?.ok) {
    // Only a clear "no" from the API signs the person out; a network blip leaves the cookies alone.
    if (res && res.status === 401) {
      request.cookies.delete('sazo_at');
      request.cookies.delete('sazo_rt');
      const out = NextResponse.next({ request: { headers: request.headers } });
      out.cookies.delete('sazo_at');
      out.cookies.delete('sazo_rt');
      return out;
    }
    return NextResponse.next();
  }
  const t = (await res.json()) as { accessToken: string; refreshToken: string; expiresIn: number };
  request.cookies.set('sazo_at', t.accessToken);
  request.cookies.set('sazo_rt', t.refreshToken);
  const out = NextResponse.next({ request: { headers: request.headers } });
  out.cookies.set('sazo_at', t.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: t.expiresIn });
  out.cookies.set('sazo_rt', t.refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 86400 });
  return out;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
