// The JSON file of one person's data, for SAZO administrators only (the API checks the permission and
// records the download in the audit log).
import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';

const back = (req: NextRequest, error: string) => NextResponse.redirect(new URL(`/admin/people?error=${encodeURIComponent(error)}`, req.url), 303);

export async function GET(req: NextRequest) {
  const phone = toE164(req.nextUrl.searchParams.get('phone') ?? '');
  if (!phone) return back(req, 'Enter a mobile number, for example 0772 123 456.');
  try {
    const data = await api<unknown>(`/admin/users/export?phone=${encodeURIComponent(phone)}`, { auth: true });
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="sazo-person-data-${phone.slice(-4)}-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return NextResponse.redirect(new URL('/sign-in?next=/admin/people', req.url), 303);
    if (err instanceof ApiError && err.status === 403) return NextResponse.redirect(new URL('/admin/no-access', req.url), 303);
    if (err instanceof ApiError && err.status === 404) return back(req, 'No SAZO account uses this number.');
    throw err;
  }
}
