// Google sent the person back. Check it's the same browser (state), let the API swap the code, then:
// logged in → go on; second step → code page; new person → finish sign-up with their details.
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { ApiError, api } from '@/lib/api';
import { GOOGLE_COOKIE, GOOGLE_SIGNUP_COOKIE, afterLogin, clientHeaders, deviceToken, type LoginResult } from '@/lib/session';

type Finish = LoginResult | { status: 'needs_details'; signupToken: string; suggested: { firstName: string | null; surname: string | null; email: string | null } };

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const back = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));
  let saved: { state: string; codeVerifier: string; nonce: string; next: string; redirectUri: string };
  try {
    saved = JSON.parse(jar.get(GOOGLE_COOKIE)?.value ?? '');
  } catch {
    return back('/sign-in?google=expired');
  }
  jar.delete({ name: GOOGLE_COOKIE, path: '/auth/google' });
  const code = req.nextUrl.searchParams.get('code');
  if (!code || req.nextUrl.searchParams.get('state') !== saved.state) return back('/sign-in?google=cancelled');
  try {
    const r = await api<Finish>('/auth/google/finish', {
      method: 'POST', headers: await clientHeaders(),
      body: { code, redirectUri: saved.redirectUri, codeVerifier: saved.codeVerifier, nonce: saved.nonce, deviceToken: await deviceToken() },
    });
    if (r.status === 'needs_details') {
      jar.set(GOOGLE_SIGNUP_COOKIE, JSON.stringify({ signupToken: r.signupToken, suggested: r.suggested, next: saved.next }),
        { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/sign-up', maxAge: 15 * 60 });
      return back('/sign-up/google');
    }
    return back(await afterLogin(r, saved.next));
  } catch (err) {
    return back(err instanceof ApiError && err.code === 'account_suspended' ? '/sign-in?google=inactive' : '/sign-in?google=failed');
  }
}
