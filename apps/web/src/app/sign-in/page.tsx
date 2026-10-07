import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await isSignedIn()) redirect(next);
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Sign in or create an account</h1>
        <p className="mt-1 text-muted">Free. See the full report, the price estimate and every record behind it.</p>
        <SignInForm next={next} />
      </div>
    </div>
  );
}
