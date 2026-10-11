'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { completeSecondStep, type SecondStepState } from '../actions';

export function SecondStepForm() {
  const [state, action, pending] = useActionState<SecondStepState, FormData>(completeSecondStep, {});
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <div>
        <label htmlFor="code" className="label">6-digit code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
          className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
        {state.error && <p role="alert" className="mt-2 text-sm font-semibold text-bad-text">{state.error}</p>}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="remember" defaultChecked className="mt-1 h-4 w-4" />
        <span>Remember this device for 90 days. Only on a phone or computer you alone use.</span>
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Checking…' : 'Confirm'}</button>
      <p className="text-center text-sm"><Link href="/sign-in" className="link">Start again</Link></p>
    </form>
  );
}
