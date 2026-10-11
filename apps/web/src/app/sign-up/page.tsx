import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import { googleEnabled } from '@/lib/session';
import { SignUpPanel } from './form';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await isSignedIn()) redirect(next);
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Create your SAZO account</h1>
        <p className="mt-1 text-muted">Free. See full reports, save cars and share checks.</p>
        <SignUpPanel next={next} google={await googleEnabled()} />
      </div>
    </div>
  );
}
