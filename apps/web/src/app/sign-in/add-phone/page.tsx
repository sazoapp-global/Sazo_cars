import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { pendingSetup } from '@/lib/session';
import { AddPhoneForm } from './form';

export const metadata: Metadata = { title: 'Add your phone', robots: { index: false } };

/** An account with no phone adds and confirms one before going in (D-145). */
export default async function AddPhone() {
  if (!(await pendingSetup('add_phone'))) redirect('/sign-in');
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Add your phone</h1>
        <p className="mt-1 text-muted">SAZO now uses your phone to check it&apos;s you on a new device and to reset a forgotten password. Add your number to carry on.</p>
        <AddPhoneForm />
      </div>
    </div>
  );
}
