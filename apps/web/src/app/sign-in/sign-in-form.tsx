'use client';
import { useActionState } from 'react';
import { signIn, type SignInState } from './actions';

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { step: 'phone' });
  const error = state.error && <p role="alert" className="mt-2 text-sm font-semibold text-bad-text">{state.error}</p>;

  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.step === 'phone' && (
        <div>
          <label htmlFor="phone" className="label">Your phone number</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={state.phoneInput}
            placeholder="0772 123 456" className="field" aria-describedby="phone-help" aria-invalid={!!state.error} />
          <p id="phone-help" className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code by SMS. No password needed.</p>
          {error}
          <button type="submit" name="intent" value="send" className="btn btn-primary mt-4 w-full" disabled={pending}>{pending ? 'Sending…' : 'Send code'}</button>
        </div>
      )}
      {state.step === 'code' && (
        <div>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.phone}</span>.</p>
          <label htmlFor="code" className="label mt-3">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
            className="field text-center !text-2xl tracking-[0.5em] tabular-nums" aria-invalid={!!state.error} />
          {error}
          <button type="submit" name="intent" value="verify" className="btn btn-primary mt-4 w-full" disabled={pending}>{pending ? 'Checking…' : 'Continue'}</button>
          <button type="submit" name="intent" value="resend" className="btn btn-ghost mt-2 w-full" disabled={pending} formNoValidate>Send a new code</button>
        </div>
      )}
      {state.step === 'name' && (
        <div>
          <p className="text-sm">Welcome to SAZO. What should we call you?</p>
          <label htmlFor="displayName" className="label mt-3">Your name</label>
          <input id="displayName" name="displayName" autoComplete="name" required maxLength={120} autoFocus className="field" aria-invalid={!!state.error} />
          <p className="mt-1 text-sm text-muted">Shown only to you and, if you join a business on SAZO, your team.</p>
          {error}
          <button type="submit" name="intent" value="verify" className="btn btn-primary mt-4 w-full" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
        </div>
      )}
      <p aria-live="polite" className="sr-only">{pending ? 'Working' : ''}</p>
    </form>
  );
}
