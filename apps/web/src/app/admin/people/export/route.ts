// One person's data as a PDF or Excel file, for SAZO administrators only (D-147). The API checks the permission
// and records each download in the audit log. GET /admin/people/export?phone=…&format=pdf|xlsx
import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, api } from '@/lib/api';
import { type DataExport, dataFile, formatOf } from '@/lib/data-export';
import { toE164 } from '@/lib/phone';

const back = (req: NextRequest, error: string) => NextResponse.redirect(new URL(`/admin/people?error=${encodeURIComponent(error)}`, req.url), 303);

export async function GET(req: NextRequest) {
  const phone = toE164(req.nextUrl.searchParams.get('phone') ?? '');
  const format = formatOf(req.nextUrl.searchParams.get('format')) ?? 'pdf';
  if (!phone) return back(req, 'Enter a mobile number, for example 0772 123 456.');
  try {
    const d = await api<DataExport>(`/admin/users/export?phone=${encodeURIComponent(phone)}`, { auth: true });
    const who = d.profile.displayName ?? 'this person';
    return await dataFile(d, format, { whose: 'their', title: `Data held by SAZO about ${who}`, fileBase: `sazo-person-data-${phone.slice(-4)}` });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return NextResponse.redirect(new URL('/sign-in?next=/admin/people', req.url), 303);
    if (err instanceof ApiError && err.status === 403) return NextResponse.redirect(new URL('/admin/no-access', req.url), 303);
    if (err instanceof ApiError && err.status === 404) return back(req, 'No SAZO account uses this number.');
    throw err;
  }
}
