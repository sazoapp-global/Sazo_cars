// A device whose sign-in has ended (4 Nov 2026): signed out from another device, or logged out after 4 hours
// without activity. Pages that find the API no longer accepts this device's token come here; the cookies are
// cleared and the person goes to the log-in page with a plain message, then back to the page they were on.
import { type NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/api';
import { safeNext } from '@/lib/phone';

export function GET(req: NextRequest) {
  const asked = safeNext(req.nextUrl.searchParams.get('next'));
  const next = asked.startsWith('/auth/') || asked.startsWith('/sign-in') ? '/' : asked;
  const done = req.nextUrl.searchParams.get('why') === 'idle' ? 'idle' : 'ended';
  const out = NextResponse.redirect(new URL(`/sign-in?done=${done}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`, req.nextUrl.origin));
  out.cookies.delete(ACCESS_COOKIE);
  out.cookies.delete(REFRESH_COOKIE);
  return out;
}
