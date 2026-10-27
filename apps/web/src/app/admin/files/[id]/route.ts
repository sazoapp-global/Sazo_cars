// Streams an evidence file (verification document, odometer photo) to SAZO staff. The API decides who
// may see it; this only adds the signed-in reviewer's token, which never reaches browser JavaScript. Only JPEG,
// PNG and PDF files are ever handed out (D-147); SAZO's internal records (such as an inspection's sealed form) are not.
import { cookies } from 'next/headers';
import { API_URL, ACCESS_COOKIE } from '@/lib/api';

const SERVED = ['image/jpeg', 'image/png', 'application/pdf'];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response('Sign in first', { status: 401 });
  const res = await fetch(`${API_URL}/v1/evidence/${id}/content`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!res.ok || !SERVED.includes(type)) { await res.body?.cancel(); return new Response('Not found', { status: 404 }); }
  return new Response(res.body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
