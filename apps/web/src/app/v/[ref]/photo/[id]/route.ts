// Streams one inspection photo of a car (front, back, sides, damage) to a signed-in buyer. The API decides
// which photos a buyer may see; this only adds the viewer's token, which never reaches browser JavaScript.
import { cookies } from 'next/headers';
import { API_URL, ACCESS_COOKIE } from '@/lib/api';

const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string; id: string }> }) {
  const { ref, id } = await params;
  if (!REF.test(ref) || !/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response('Sign in first', { status: 401 });
  const res = await fetch(`${API_URL}/v1/vehicles/${ref}/photos/${id}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) return new Response('Not found', { status: 404 });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
