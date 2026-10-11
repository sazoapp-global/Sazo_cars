import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetForm } from './form';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
        {token && /^[A-Za-z0-9_-]{20,100}$/.test(token)
          ? <><p className="mt-1 text-muted">All your devices will be logged out. Then log in with the new password.</p><ResetForm token={token} /></>
          : <p className="mt-2">This link is incomplete. <Link href="/forgot-password" className="link">Ask for a new one</Link>.</p>}
      </div>
    </div>
  );
}
