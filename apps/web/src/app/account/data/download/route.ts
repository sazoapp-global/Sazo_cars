// "Download my data" as a file (D-147): PDF or Excel. GET /account/data/download?format=pdf|xlsx
import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, api } from '@/lib/api';
import { type DataExport, dataFile, formatOf } from '@/lib/data-export';

export async function GET(req: NextRequest) {
  const format = formatOf(req.nextUrl.searchParams.get('format'));
  if (!format) return NextResponse.redirect(new URL('/account/data', req.url), 303);
  try {
    const d = await api<DataExport>('/me/export', { auth: true });
    return await dataFile(d, format, { whose: 'your', title: 'Your data held by SAZO', fileBase: 'sazo-my-data' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return NextResponse.redirect(new URL('/sign-in?next=/account/data', req.url), 303);
    throw err;
  }
}
