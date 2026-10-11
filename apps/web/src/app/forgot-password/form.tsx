'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPassword, type ForgotState } from './actions';

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgotPassword, {});
  if (state.sent) {
    return (
      <div role="status" className="mt-6 space-y-3">
        <p className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">If {state.email} has a SAZO account, we&apos;ve sent a link to it. It works for 1 hour.</p>
        <p className="text-sm text-muted">No email? Check spam, or log in with your phone code and set a new password in Settings.</p>
        <Link href="/sign-in" className="link inline-block">Back to log in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className="field" />
        {state.error && <p role="alert" className="mt-2 text-sm font-semibold text-bad-text">{state.error}</p>}
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Sending…' : 'Send the link'}</button>
      <p className="text-center text-sm"><Link href="/sign-in" className="link">Back to log in</Link></p>
    </form>
  );
}
