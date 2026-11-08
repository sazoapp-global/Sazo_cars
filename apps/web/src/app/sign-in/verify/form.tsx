'use client';
// The second step on a new device (D-145), laid out again on 8 Nov 2026: the code, "Remember this device" in its own
// box, Confirm, then help under a line. A texted or emailed code can be sent again a minute after the last one
// ("Resend code in 0:42"); an authenticator app makes its own codes, so it gets advice and the backup code instead.
import { useActionState, useEffect, useState } from 'react';
import { PasswordField } from '@/components/auth/password-field';
import type { SecondStepChannel } from '@/lib/session';
import { completeSecondStep, resendSecondStepCode, type ResendState, type SecondStepState } from '../actions';

/** Seconds left of a wait, counted on this device's clock from when the wait was given (`key` changes per wait). */
function useSecondsLeft(seconds: number, key: unknown) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const until = Date.now() + seconds * 1000;
    setLeft(seconds);
    if (seconds <= 0) return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(l);
      if (!l) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [seconds, key]);
  return left;
}

function Resend({ waitSeconds }: { waitSeconds: number }) {
  const [state, action, pending] = useActionState<ResendState, FormData>(resendSecondStepCode, {});
  const left = useSecondsLeft(state.waitSeconds ?? waitSeconds, state.at);
  return (
    <>
      {state.sent && <p role="status" className="rounded-xl border border-ok-line bg-ok-fill p-3 text-sm font-semibold text-ok-text">{state.sent}</p>}
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error}</p>}
      <p className="text-muted">Didn&apos;t get the code?</p>
      <button formAction={action} formNoValidate type="submit" className="btn btn-ghost mt-2 w-full" disabled={pending || left > 0}>
        {pending ? 'Sending…' : left > 0 ? <>Resend code in <span className="tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span></> : 'Resend code'}
      </button>
    </>
  );
}

export function SecondStepForm({ channel, waitSeconds = 0 }: { channel: SecondStepChannel; waitSeconds?: number }) {
  const [state, action, pending] = useActionState<SecondStepState, FormData>(completeSecondStep, {});
  const [backup, setBackup] = useState(false);
  return (
    <form action={action} className="mt-5 space-y-4" noValidate>
      {channel === 'password' ? (
        <PasswordField id="code" name="code" label="Password" autoComplete="current-password" />
      ) : backup ? (
        <div>
          <label htmlFor="code" className="label">Backup code</label>
          <input id="code" name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={14} required autoFocus placeholder="k7m2p-9xq4t"
            className="field text-center !text-xl tracking-widest" />
          <p className="mt-1 text-sm text-muted">Each backup code works once.</p>
        </div>
      ) : (
        <div>
          <label htmlFor="code" className="label">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
            className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
        </div>
      )}
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error}</p>}
      <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
        <input type="checkbox" name="remember" defaultChecked className="mt-1 h-4 w-4" />
        <span>Remember this device for 90 days. Only on a phone or computer you alone use.</span>
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Checking…' : 'Confirm'}</button>
      {channel !== 'password' && (
        <div className="space-y-2 border-t border-line pt-4 text-center text-sm">
          {channel === 'authenticator' ? (
            <>
              {!backup && <p className="text-muted">The app shows a new code every 30 seconds. If one did not work, type the newest one.</p>}
              <button type="button" className="btn btn-ghost mt-1 w-full" onClick={() => setBackup((b) => !b)}>{backup ? 'Use the code from the app' : 'Lost your phone? Use a backup code'}</button>
            </>
          ) : <Resend waitSeconds={waitSeconds} />}
        </div>
      )}
    </form>
  );
}
