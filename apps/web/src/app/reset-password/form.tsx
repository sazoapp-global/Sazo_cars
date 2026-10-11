'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { resetPassword, type ResetState } from './actions';

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPassword, {});
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="label">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" aria-describedby="pw-help" />
        <p id="pw-help" className="mt-1 text-sm text-muted">At least 8 characters (12 if you manage a business or work for SAZO).</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">New password again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="field" />
      </div>
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error} {state.error.includes('link') && <Link href="/forgot-password" className="link">Ask for a new one</Link>}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}
