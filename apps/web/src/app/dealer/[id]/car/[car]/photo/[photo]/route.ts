// Streams one of a dealer's car photos to that dealer's staff. The API checks the person works for the dealer;
// this only adds their token, which never reaches browser JavaScript.
import { cookies } from 'next/headers';
import { API_URL, ACCESS_COOKIE } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; car: string; photo: string }> }) {
  const { id, car, photo } = await params;
  if (![id, car, photo].every((x) => UUID.test(x))) return new Response('Not found', { status: 404 });
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response('Sign in first', { status: 401 });
  const res = await fetch(`${API_URL}/v1/dealer/stock/${car}/photos/${photo}`, { headers: { Authorization: `Bearer ${token}`, 'X-Organisation-Id': id }, cache: 'no-store' });
  if (!res.ok) return new Response('Not found', { status: 404 });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
