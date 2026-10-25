'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { resetPassword, type ResetState } from './actions';

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPassword, { step: 'start' });
  const error = state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error} {state.error.includes('link') && <Link href="/forgot-password" className="link">Ask for a new one</Link>}</p>;

  if (state.step === 'start' && state.noPhone) {
    return (
      <div role="alert" className="mt-6 rounded-lg border border-warn-line bg-warn-fill p-4 text-sm text-warn-text">
        <p className="font-semibold">Your account has no phone number.</p>
        <p className="mt-1">A reset needs a code texted to your phone, so it can&apos;t be done from this link. Log in another way (phone code or Google) and add a phone in Settings, or contact SAZO support.</p>
        <p className="mt-3"><Link href="/sign-in" className="link">Back to log in</Link> · <Link href="/help" className="link">Contact SAZO support</Link></p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.step === 'start' ? (
        <>
          <p className="text-sm">To keep your account safe, we&apos;ll also text a code to the phone on your account.</p>
          {error}
          <button type="submit" name="intent" value="send" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Sending…' : 'Text me a code'}</button>
        </>
      ) : (
        <>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.sentTo}</span>.</p>
          <div>
            <label htmlFor="code" className="label">6-digit code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
              className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
          </div>
          <div>
            <label htmlFor="password" className="label">New password</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" aria-describedby="pw-help" />
            <p id="pw-help" className="mt-1 text-sm text-muted">At least 8 characters (12 if you manage a business or work for SAZO).</p>
          </div>
          <div>
            <label htmlFor="confirm" className="label">New password again</label>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="field" />
          </div>
          {error}
          <button type="submit" name="intent" value="save" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Saving…' : 'Save new password'}</button>
          <button type="submit" name="intent" value="resend" className="btn btn-ghost w-full" disabled={pending} formNoValidate>Send a new code</button>
        </>
      )}
    </form>
  );
}
