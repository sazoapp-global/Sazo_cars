import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { pendingSecondStep } from '@/lib/session';
import { Icon } from '@/components/icon';
import { SecondStepForm } from './form';

export const metadata: Metadata = { title: 'Confirm it’s you', robots: { index: false } };

/** The second step on a new device, for everyone (D-145). */
export default async function SecondStep() {
  const pending = await pendingSecondStep();
  if (!pending) redirect('/sign-in');
  const how = pending.channel === 'authenticator' ? <>Open your <b>authenticator app</b> and type the 6-digit code it shows for SAZO.</>
    : pending.channel === 'password' ? 'You logged in with a phone code. Type your SAZO password as well.'
    : <>We sent a 6-digit code {pending.channel === 'sms' ? 'by SMS to' : 'by email to'} <b className="tabular-nums">{pending.sentTo}</b>.</>;
  // How long until "Resend code" works, from SAZO's clock; the page counts it down on the device's own clock.
  const wait = pending.resendAt ? Math.max(0, Math.ceil((pending.resendAt - Date.now()) / 1000)) : 0;
  const icon = pending.channel === 'authenticator' ? 'mobile' : pending.channel === 'password' ? 'lock' : pending.channel === 'sms' ? 'sms' : 'mail';
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <div className="text-center">
          <span className="inline-grid h-14 w-14 place-items-center rounded-full bg-soft text-primary-container"><Icon name={icon} size={28} /></span>
          <h1 className="mt-3 font-display text-2xl font-bold">Confirm it&apos;s you</h1>
          <p className="mt-1 text-muted">You&apos;re logging in on a new device.</p>
          <p className="mt-4 rounded-xl bg-soft p-3 text-sm">{how}</p>
        </div>
        <SecondStepForm channel={pending.channel} waitSeconds={wait} />
      </div>
    </div>
  );
}
