import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api, isSignedIn } from '@/lib/api';
import type { Me } from '@/lib/types';
import { RegisterForm } from './form';

export const metadata: Metadata = { title: 'Register your business' };

const TYPES = ['garage', 'dealer', 'inspector', 'inspection_centre'];

export default async function Register({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const t = (await searchParams).type;
  const type = t && TYPES.includes(t) ? t : undefined;
  const here = `/business/register${type ? `?type=${type}` : ''}`;
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const me = await api<Me>('/me', { auth: true }).catch(() => undefined);
  if (me?.needsDetails.length) redirect(`/account/complete?next=${encodeURIComponent(here)}`);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Register your business</h1>
      <p className="mt-1 text-muted">SAZO checks every business before it can add to vehicle histories. It usually takes a few working days.</p>
      <RegisterForm defaultType={type} />
    </div>
  );
}
