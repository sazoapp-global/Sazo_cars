'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { PasswordField } from '@/components/auth/password-field';
import type { SecondStepChannel } from '@/lib/session';
import { completeSecondStep, type SecondStepState } from '../actions';

export function SecondStepForm({ channel }: { channel: SecondStepChannel }) {
  const [state, action, pending] = useActionState<SecondStepState, FormData>(completeSecondStep, {});
  const [backup, setBackup] = useState(false);
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
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
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="remember" defaultChecked className="mt-1 h-4 w-4" />
        <span>Remember this device for 90 days. Only on a phone or computer you alone use.</span>
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Checking…' : 'Confirm'}</button>
      {channel === 'authenticator' && (
        <p className="text-center text-sm">
          <button type="button" className="link" onClick={() => setBackup((b) => !b)}>{backup ? 'Use the code from the app' : 'Lost your phone? Use a backup code'}</button>
        </p>
      )}
      <p className="text-center text-sm"><Link href="/sign-in" className="link">Start again</Link></p>
    </form>
  );
}
