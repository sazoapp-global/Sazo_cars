// A photo on a shared car page. The API checks the link still leads to a car for sale.
import { API_URL } from '@/lib/api';

const TOKEN = /^[A-Za-z0-9_-]{20,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; photo: string }> }) {
  const { token, photo } = await params;
  if (!TOKEN.test(token) || !UUID.test(photo)) return new Response('Not found', { status: 404 });
  const res = await fetch(`${API_URL}/v1/cars/${token}/photos/${photo}`, { cache: 'no-store' });
  if (!res.ok) return new Response('Not found', { status: 404 });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=600',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
