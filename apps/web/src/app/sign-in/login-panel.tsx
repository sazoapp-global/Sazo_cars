'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { loginWithPassword, loginWithPhone, type PasswordLoginState, type PhoneLoginState } from './actions';

/** Log in (D-100): email + password or phone code, plus Google when it is switched on. */
export function LoginPanel({ next, google }: { next: string; google: boolean }) {
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const signUp = `/sign-up?next=${encodeURIComponent(next)}`;
  return (
    <div className="mt-6 space-y-5">
      {google && (
        <>
          <a href={`/auth/google/start?next=${encodeURIComponent(next)}`} className="btn btn-ghost w-full"><GoogleMark />Continue with Google</a>
          <p className="divider">or</p>
        </>
      )}
      <div role="tablist" aria-label="How to log in" className="segmented">
        <button type="button" role="tab" id="tab-email" aria-controls="panel-email" aria-selected={method === 'email'} onClick={() => setMethod('email')}>Email and password</button>
        <button type="button" role="tab" id="tab-phone" aria-controls="panel-phone" aria-selected={method === 'phone'} onClick={() => setMethod('phone')}>Phone code</button>
      </div>
      <div role="tabpanel" id="panel-email" aria-labelledby="tab-email" hidden={method !== 'email'}><PasswordForm next={next} signUp={signUp} /></div>
      <div role="tabpanel" id="panel-phone" aria-labelledby="tab-phone" hidden={method !== 'phone'}><PhoneForm next={next} signUp={signUp} /></div>
      <p className="text-center text-sm">New to SAZO? <Link href={signUp} className="link">Create an account</Link></p>
    </div>
  );
}

function Alert({ text, signUp }: { text?: string; signUp?: string }) {
  if (!text) return null;
  return <p role="alert" className="mt-2 text-sm font-semibold text-bad-text">{text}{signUp && <> <Link href={signUp} className="link">Create an account</Link></>}</p>;
}

function PasswordForm({ next, signUp }: { next: string; signUp: string }) {
  const [state, action, pending] = useActionState<PasswordLoginState, FormData>(loginWithPassword, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className="field" />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="label">Password</label>
          <Link href="/forgot-password" className="link text-sm">Forgot password?</Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <Alert text={state.error} signUp={state.noAccount ? signUp : undefined} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}

function PhoneForm({ next, signUp }: { next: string; signUp: string }) {
  const [state, action, pending] = useActionState<PhoneLoginState, FormData>(loginWithPhone, { step: 'phone' });
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.step === 'phone' ? (
        <div>
          <label htmlFor="phone" className="label">Your phone number</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={state.phoneInput}
            placeholder="0772 123 456" className="field" aria-describedby="phone-help" />
          <p id="phone-help" className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code by SMS.</p>
          <Alert text={state.error} signUp={state.noAccount ? signUp : undefined} />
          <button type="submit" name="intent" value="send" className="btn btn-primary mt-4 w-full" disabled={pending}>{pending ? 'Sending…' : 'Send code'}</button>
        </div>
      ) : (
        <div>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.phone}</span>.</p>
          <label htmlFor="code" className="label mt-3">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
            className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
          <Alert text={state.error} />
          <button type="submit" name="intent" value="verify" className="btn btn-primary mt-4 w-full" disabled={pending}>{pending ? 'Checking…' : 'Log in'}</button>
          <button type="submit" name="intent" value="resend" className="btn btn-ghost mt-2 w-full" disabled={pending} formNoValidate>Send a new code</button>
        </div>
      )}
      <p aria-live="polite" className="sr-only">{pending ? 'Working' : ''}</p>
    </form>
  );
}

export function GoogleMark() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
