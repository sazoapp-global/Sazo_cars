import { notFound, redirect } from 'next/navigation';
import { api, isSignedIn } from '@/lib/api';
import type { PartnerSource } from '@/lib/types';

export async function loadSource(code: string, next: string): Promise<PartnerSource> {
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const source = (await api<PartnerSource[]>('/ingest/sources', { auth: true })).find((s) => s.code === code);
  if (!source) notFound();
  return source;
}
