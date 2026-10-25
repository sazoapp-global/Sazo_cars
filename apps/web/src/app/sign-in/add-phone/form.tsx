'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { Alert, PhoneInput } from '@/components/auth/auth-bits';
import { addPhone, type AddPhoneState } from '../actions';

export function AddPhoneForm() {
  const [state, action, pending] = useActionState<AddPhoneState, FormData>(addPhone, { step: 'phone' });
  return (
    <form action={action} className="mt-5 space-y-4" noValidate>
      {state.step === 'phone' ? (
        <>
          <div>
            <label htmlFor="phone" className="label">Mobile number</label>
            <PhoneInput id="phone" defaultValue={state.phoneInput} describedBy="phone-help" />
            <p id="phone-help" className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code by SMS to confirm it.</p>
          </div>
          <Alert text={state.error} />
          <button type="submit" name="intent" value="send" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Sending…' : 'Send code'}</button>
        </>
      ) : (
        <>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.sentTo}</span>.</p>
          <div>
            <label htmlFor="code" className="label">6-digit code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
              className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
          </div>
          <Alert text={state.error} />
          <button type="submit" name="intent" value="verify" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Checking…' : 'Confirm and carry on'}</button>
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="intent" value="back" className="btn btn-ghost" disabled={pending} formNoValidate>Change number</button>
            <button type="submit" name="intent" value="resend" className="btn btn-ghost" disabled={pending} formNoValidate>Send a new code</button>
          </div>
        </>
      )}
      <p className="text-center text-sm"><Link href="/sign-in" className="link">Start again</Link></p>
    </form>
  );
}
