// A business's logo or a person's photo (D-186), through this site. A new picture gets a new id, so a picture may
// be kept for a long time.
import { API_URL } from '@/lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const res = await fetch(`${API_URL}/v1/pictures/${id}`, { cache: 'no-store' });
  if (!res.ok) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      // Long for a logo; a removed photo is gone from SAZO, and only its old id could still be cached for a day.
      'Cache-Control': 'public, max-age=86400',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
