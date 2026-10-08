// Streams an evidence file (verification document, odometer photo) to SAZO staff. The API decides who
// may see it; this only adds the signed-in reviewer's token, which never reaches browser JavaScript.
import { cookies } from 'next/headers';
import { API_URL, ACCESS_COOKIE } from '@/lib/api';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response('Sign in first', { status: 401 });
  const res = await fetch(`${API_URL}/v1/evidence/${id}/content`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) return new Response('Not found', { status: 404 });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
