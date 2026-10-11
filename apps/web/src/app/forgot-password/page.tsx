import type { Metadata } from 'next';
import { ForgotForm } from './form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPassword() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Forgot your password?</h1>
        <p className="mt-1 text-muted">Enter the email on your SAZO account. We&apos;ll send a link to choose a new password.</p>
        <ForgotForm />
      </div>
    </div>
  );
}
