'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { confirmEmail, type VerifyState } from './actions';

export function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(confirmEmail, {});
  if (state.done) return <p role="status" className="mt-4 rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">Your email is confirmed. <Link href="/sign-in" className="link">Log in</Link></p>;
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-muted">Press the button to confirm this email address for your SAZO account.</p>
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Confirming…' : 'Confirm my email'}</button>
    </form>
  );
}
