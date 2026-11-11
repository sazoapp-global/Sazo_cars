import { Flash } from '@/components/flash';
import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';
import { PICTURE_ACCEPT } from '@/lib/upload-types';
import { applyBroker } from '../broker/actions';

// Becoming a broker (D-127): apply with a National ID. Moved out of /broker (11 Nov 2026), which is now the
// broker's own workspace with a side bar; once SAZO approves the application, /broker opens.
export const metadata: Metadata = { title: 'Become a broker', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string }>;

export default async function BecomeABroker({ searchParams }: { searchParams: SP }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/become-a-broker');
  const sp = await searchParams;
  const status = await api<{ isBroker: boolean; application: { status: string; decisionReason: string | null; createdAt: string } | null }>('/broker/application', { auth: true });
  if (status.isBroker) redirect('/broker');
  const notice = <>
    {sp.done && <Flash className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</Flash>}
    {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
  </>;
    const profile = await api<{ progress: { percent: number } }>('/me/profile', { auth: true });
    const a = status.application;
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 md:px-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Become a broker</h1>
          <p className="mt-2 text-muted">Share cars from approved dealers with your buyers. Customers who ask through your link are registered to you, and you can follow your commission here. Dealers set the commission for each car; SAZO keeps the record, it does not pay it.</p>
        </div>
        {notice}
        {a?.status === 'pending' ? (
          <p className="card p-4"><strong>SAZO is checking your ID.</strong> You applied on {formatDate(a.createdAt)}. You will see the result here.</p>
        ) : profile.progress.percent < 100 ? (
          <div className="card p-4">
            <p><strong>First, finish your profile</strong> ({profile.progress.percent}% done): your details, a confirmed phone and email, and a password.</p>
            <p className="mt-3"><Link href="/account" className="btn btn-primary">Finish your profile</Link></p>
          </div>
        ) : (
          <section className="card p-4 md:p-5" aria-labelledby="apply">
            {a?.status === 'rejected' && <p className="mb-3 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm text-warn-text">Your last application was not approved: {a.decisionReason}. You can apply again.</p>}
            <h2 id="apply" className="font-display text-lg font-bold">Your National ID</h2>
            <p className="mt-1 text-sm text-muted">A SAZO administrator checks that the ID matches your name. Your ID number is kept encrypted and is never shown to dealers or buyers.</p>
            <form action={applyBroker} className="mt-3 grid gap-3">
              <div><label htmlFor="nin" className="label">National ID number (NIN)</label><input id="nin" name="nin" required className="field sazo-id" autoCapitalize="characters" autoComplete="off" placeholder="CM12345678ABCD" /></div>
              <div><label htmlFor="idPhoto" className="label">Photo of your National ID</label>
                <input id="idPhoto" name="idPhoto" type="file" required accept={PICTURE_ACCEPT} capture="environment" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
              <div><button className="btn btn-primary"><Icon name="badge" />Send for checking</button></div>
            </form>
          </section>
        )}
      </div>
    );
}
