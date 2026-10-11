'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { PersonFields } from '@/components/person-fields';
import { GoogleMark } from '../sign-in/login-panel';
import { signUpWithEmail, signUpWithPhone, type EmailSignUpState, type PhoneSignUpState } from './actions';

/** Create an account (D-100): email + password or phone code, plus Google when it is switched on. */
export function SignUpPanel({ next, google }: { next: string; google: boolean }) {
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const login = `/sign-in?next=${encodeURIComponent(next)}`;
  return (
    <div className="mt-6 space-y-5">
      {google && (
        <>
          <a href={`/auth/google/start?next=${encodeURIComponent(next)}`} className="btn btn-ghost w-full"><GoogleMark />Sign up with Google</a>
          <p className="divider">or</p>
        </>
      )}
      <div role="tablist" aria-label="How to sign up" className="segmented">
        <button type="button" role="tab" id="tab-email" aria-controls="panel-email" aria-selected={method === 'email'} onClick={() => setMethod('email')}>Email and password</button>
        <button type="button" role="tab" id="tab-phone" aria-controls="panel-phone" aria-selected={method === 'phone'} onClick={() => setMethod('phone')}>Phone code</button>
      </div>
      <div role="tabpanel" id="panel-email" aria-labelledby="tab-email" hidden={method !== 'email'}><EmailForm next={next} login={login} /></div>
      <div role="tabpanel" id="panel-phone" aria-labelledby="tab-phone" hidden={method !== 'phone'}><PhoneForm next={next} login={login} /></div>
      <p className="text-center text-sm">Already have an account? <Link href={login} className="link">Log in</Link></p>
    </div>
  );
}

function Alert({ text, login }: { text?: string; login?: string }) {
  if (!text) return null;
  return <p role="alert" className="text-sm font-semibold text-bad-text">{text}{login && <> <Link href={login} className="link">Log in</Link></>}</p>;
}

function EmailForm({ next, login }: { next: string; login: string }) {
  const [state, action, pending] = useActionState<EmailSignUpState, FormData>(signUpWithEmail, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <PersonFields values={state.values} errors={e} />
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} className="field" aria-invalid={!!e.email} />
        {e.email && <p className="mt-1 text-sm font-semibold text-bad-text">{e.email}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" aria-describedby="pw-help" aria-invalid={!!e.password} />
          {e.password && <p className="mt-1 text-sm font-semibold text-bad-text">{e.password}</p>}
        </div>
        <div>
          <label htmlFor="confirm" className="label">Password again</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="field" aria-invalid={!!e.confirm} />
          {e.confirm && <p className="mt-1 text-sm font-semibold text-bad-text">{e.confirm}</p>}
        </div>
      </div>
      <p id="pw-help" className="-mt-2 text-sm text-muted">At least 8 characters. A short sentence is easy to remember and hard to guess.</p>
      <Alert text={state.error} login={state.exists ? login : undefined} />
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
    </form>
  );
}

function PhoneForm({ next, login }: { next: string; login: string }) {
  const [state, action, pending] = useActionState<PhoneSignUpState, FormData>(signUpWithPhone, { step: 'details' });
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.step === 'details' ? (
        <>
          <PersonFields values={state.values} errors={state.errors} idPrefix="ph-" />
          <div>
            <label htmlFor="su-phone" className="label">Phone number</label>
            <input id="su-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="0772 123 456" defaultValue={state.values?.phone} className="field" aria-describedby="su-phone-help" />
            <p id="su-phone-help" className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code by SMS. You can add an email and password later.</p>
            {state.errors?.phone && <p className="mt-1 text-sm font-semibold text-bad-text">{state.errors.phone}</p>}
          </div>
          <Alert text={state.error} login={state.exists ? login : undefined} />
          <button type="submit" name="intent" value="send" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Sending…' : 'Send code'}</button>
        </>
      ) : (
        <>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.phone}</span>.</p>
          <div>
            <label htmlFor="su-code" className="label">6-digit code</label>
            <input id="su-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
              className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
          </div>
          <Alert text={state.error} />
          <button type="submit" name="intent" value="verify" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="intent" value="back" className="btn btn-ghost" disabled={pending} formNoValidate>Change details</button>
            <button type="submit" name="intent" value="resend" className="btn btn-ghost" disabled={pending} formNoValidate>Send a new code</button>
          </div>
        </>
      )}
      <p aria-live="polite" className="sr-only">{pending ? 'Working' : ''}</p>
    </form>
  );
}
