import type { Metadata } from 'next';
import { VerifyForm } from './form';

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } };

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Confirm your email</h1>
        {token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? <VerifyForm token={token} /> : <p className="mt-2">This link is incomplete. Ask for a new one in Settings.</p>}
      </div>
    </div>
  );
}
