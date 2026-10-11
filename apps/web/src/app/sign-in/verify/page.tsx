import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { pendingSecondStep } from '@/lib/session';
import { SecondStepForm } from './form';

export const metadata: Metadata = { title: 'Confirm it’s you', robots: { index: false } };

/** Second step for sensitive roles on a new device (D-105). */
export default async function SecondStep() {
  const pending = await pendingSecondStep();
  if (!pending) redirect('/sign-in');
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Confirm it&apos;s you</h1>
        <p className="mt-1 text-muted">You&apos;re logging in on a new device. Your role on SAZO can change car histories, so we check it&apos;s really you.</p>
        <p className="mt-4 text-sm">We sent a code {pending.channel === 'sms' ? 'by SMS to' : 'by email to'} <span className="font-semibold">{pending.sentTo}</span>.</p>
        <SecondStepForm />
      </div>
    </div>
  );
}
