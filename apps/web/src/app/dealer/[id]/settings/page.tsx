// Business settings moved into Business details (D-192, 18 Nov 2026); old links still work.
import { redirect } from 'next/navigation';

export default async function DealerSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string'));
  redirect(`/business/${id}${q.size ? `?${q}` : ''}#settings`);
}
