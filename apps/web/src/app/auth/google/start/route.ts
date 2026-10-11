// Start Google sign-in (D-100): ask the API for Google's address, keep state/verifier/nonce in a short
// httpOnly cookie for this browser, and send the person to Google.
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import { GOOGLE_COOKIE } from '@/lib/session';

export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const redirectUri = `${req.nextUrl.origin}/auth/google/callback`;
  try {
    const s = await api<{ url: string; state: string; codeVerifier: string; nonce: string }>('/auth/google/start', { method: 'POST', body: { redirectUri } });
    (await cookies()).set(GOOGLE_COOKIE, JSON.stringify({ state: s.state, codeVerifier: s.codeVerifier, nonce: s.nonce, next, redirectUri }),
      { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/auth/google', maxAge: 10 * 60 });
    return NextResponse.redirect(s.url);
  } catch {
    return NextResponse.redirect(new URL('/sign-in?google=unavailable', req.nextUrl.origin));
  }
}
