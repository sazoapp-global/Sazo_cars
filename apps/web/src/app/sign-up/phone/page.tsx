import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ForgetDraft } from '@/components/draft-keeper';
import { isSignedIn } from '@/lib/api';
import { signUpPhone } from '../phone-cookie';
import { ConfirmPhoneForm } from './form';

export const metadata: Metadata = { title: 'Confirm your mobile number', robots: { index: false } };

/** Straight after an email sign-up (27 Oct 2026): the account is made; the mobile number is confirmed now, so the
 * first log-in later is not stopped to add it (D-145). */
export default async function SignUpPhone() {
  if (!(await isSignedIn())) redirect('/sign-in');
  const kept = await signUpPhone();
  if (!kept) redirect('/');
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <ForgetDraft name="sign-up" />
      <div className="card p-6">
        <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">Your account is made.</p>
        <h1 className="mt-4 font-display text-2xl font-bold">Confirm your mobile number</h1>
        <p className="mt-1 text-muted">SAZO uses your phone to check it&apos;s you on a new device and to reset a forgotten password.</p>
        <ConfirmPhoneForm initial={kept.phone ? { step: 'code', phone: kept.phone } : { step: 'phone', phoneInput: kept.phoneInput, error: kept.error }} />
      </div>
    </div>
  );
}
