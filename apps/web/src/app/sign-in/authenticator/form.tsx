'use client';
import { useActionState } from 'react';
import { Alert } from '@/components/auth/auth-bits';
import { confirmAuthenticator, type AuthenticatorState } from '../actions';

export function AuthenticatorForm() {
  const [state, action, pending] = useActionState<AuthenticatorState, FormData>(confirmAuthenticator, {});
  return (
    <form action={action} className="mt-5 space-y-4" noValidate>
      <div>
        <label htmlFor="code" className="label">6-digit code from the app</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
          className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
      </div>
      <Alert text={state.error} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Checking…' : 'Confirm'}</button>
    </form>
  );
}
