import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import { googleEnabled } from '@/lib/session';
import { LoginPanel } from './login-panel';

export const metadata: Metadata = { title: 'Log in' };

/** Messages shown after other pages send people here (fixed texts: nothing from the address is shown). */
const DONE: Record<string, string> = { password_reset: 'Your password has been changed. Log in with the new one.' };
const GOOGLE: Record<string, string> = {
  unavailable: 'Google sign-in is not available right now. Use your email or phone.', expired: 'That took too long. Try Google again.',
  cancelled: 'Google sign-in was cancelled.', failed: 'Google sign-in did not work. Try again, or use your email or phone.', inactive: 'This account is not active. Contact SAZO.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; done?: string; google?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await isSignedIn()) redirect(next);
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Log in to SAZO</h1>
        <p className="mt-1 text-muted">See the full report, the price estimate and every record behind it.</p>
        {sp.done && DONE[sp.done] && <p role="status" className="mt-4 rounded-lg border border-ok-line bg-ok-fill p-3 text-sm font-semibold text-ok-text">{DONE[sp.done]}</p>}
        {sp.google && GOOGLE[sp.google] && <p role="alert" className="mt-4 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm font-semibold text-warn-text">{GOOGLE[sp.google]}</p>}
        <LoginPanel next={next} google={await googleEnabled()} />
      </div>
    </div>
  );
}
