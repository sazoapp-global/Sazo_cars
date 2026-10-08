// "Download my data": the API's export, saved as a file. The sign-in stays on this server.
import { cookies } from 'next/headers';
import { API_URL, ACCESS_COOKIE } from '@/lib/api';

export async function GET() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response('Sign in first', { status: 401 });
  const res = await fetch(`${API_URL}/v1/me/export`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) return new Response('Could not prepare your data', { status: res.status });
  return new Response(JSON.stringify(await res.json(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="sazo-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
