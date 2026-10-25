import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { pendingSecondStep } from '@/lib/session';
import { SecondStepForm } from './form';

export const metadata: Metadata = { title: 'Confirm it’s you', robots: { index: false } };

/** The second step on a new device, for everyone (D-145). */
export default async function SecondStep() {
  const pending = await pendingSecondStep();
  if (!pending) redirect('/sign-in');
  const how = pending.channel === 'authenticator' ? 'Open your authenticator app and type the 6-digit code it shows for SAZO.'
    : pending.channel === 'password' ? 'You logged in with a phone code. Type your SAZO password as well.'
    : <>We sent a code {pending.channel === 'sms' ? 'by SMS to' : 'by email to'} <span className="font-semibold">{pending.sentTo}</span>.</>;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Confirm it&apos;s you</h1>
        <p className="mt-1 text-muted">You&apos;re logging in on a new device, so we check it&apos;s really you.</p>
        <p className="mt-4 text-sm">{how}</p>
        <SecondStepForm channel={pending.channel} />
      </div>
    </div>
  );
}
