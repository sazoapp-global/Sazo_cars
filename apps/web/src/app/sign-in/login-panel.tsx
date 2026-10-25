'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Alert, AuthTabs, GoogleButton, ModeSwitch, PhoneInput, RememberDevice } from '@/components/auth/auth-bits';
import { PasswordField } from '@/components/auth/password-field';
import { Icon } from '@/components/icon';
import { loginWithPassword, loginWithPhone, type PasswordLoginState, type PhoneLoginState } from './actions';

/** Sign In (D-100): mobile number + code, or email + password; Google when it is switched on. */
export function LoginPanel({ next, google }: { next: string; google: boolean }) {
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const signUp = `/sign-up${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <>
      <h1 className="mt-6 font-display text-3xl font-extrabold text-ink">Welcome to SAZO</h1>
      <p className="mt-1 text-muted">Your companion for buying and owning a car in Uganda.</p>
      <AuthTabs active="sign-in" next={next} />
      {google ? <GoogleButton next={next} label="Continue with Google" /> : <div className="mt-5" />}
      {mode === 'phone' ? <PhoneForm next={next} signUp={signUp} mode={mode} setMode={setMode} /> : <PasswordForm next={next} signUp={signUp} mode={mode} setMode={setMode} />}
    </>
  );
}

type FormProps = { next: string; signUp: string; mode: 'phone' | 'email'; setMode: (m: 'phone' | 'email') => void };

function PasswordForm({ next, signUp, mode, setMode }: FormProps) {
  const [state, action, pending] = useActionState<PasswordLoginState, FormData>(loginWithPassword, {});
  return (
    <form action={action} data-draft="sign-in" className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <div className="mb-1.5 flex items-baseline justify-between"><label htmlFor="email" className="label !mb-0">Email</label><ModeSwitch mode={mode} onChange={setMode} /></div>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={state.email} className="field !bg-soft focus:!bg-card" />
      </div>
      <PasswordField id="password" name="password" label="Password" autoComplete="current-password" />
      <div className="flex items-center justify-between gap-3"><RememberDevice id="remember-email" /><Link href="/forgot-password" className="text-sm font-semibold text-primary-container hover:underline">Forgot password?</Link></div>
      <Alert text={state.error} link={state.noAccount ? { href: signUp, label: 'Create an account' } : undefined} />
      <button type="submit" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Logging in…' : <>Log in to SAZO<Icon name="arrow_forward" /></>}</button>
    </form>
  );
}

function PhoneForm({ next, signUp, mode, setMode }: FormProps) {
  const [state, action, pending] = useActionState<PhoneLoginState, FormData>(loginWithPhone, { step: 'phone' });
  return (
    <form action={action} data-draft="sign-in" className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.step === 'phone' ? (
        <>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between"><label htmlFor="phone" className="label !mb-0">Mobile number</label><ModeSwitch mode={mode} onChange={setMode} /></div>
            <PhoneInput id="phone" defaultValue={state.phoneInput} describedBy="phone-help" />
            <p id="phone-help" className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code by SMS.</p>
          </div>
          <RememberDevice id="remember-phone" />
          <Alert text={state.error} link={state.noAccount ? { href: signUp, label: 'Create an account' } : undefined} />
          <button type="submit" name="intent" value="send" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Sending…' : <>Send code<Icon name="arrow_forward" /></>}</button>
        </>
      ) : (
        <>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.phone}</span>.</p>
          <div>
            <label htmlFor="code" className="label">6-digit code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
              className="field !bg-soft text-center !text-2xl tracking-[0.5em] tabular-nums focus:!bg-card" />
          </div>
          <Alert text={state.error} />
          <button type="submit" name="intent" value="verify" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Checking…' : <>Log in to SAZO<Icon name="arrow_forward" /></>}</button>
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="intent" value="back" className="btn btn-ghost" disabled={pending} formNoValidate>Change number</button>
            <button type="submit" name="intent" value="resend" className="btn btn-ghost" disabled={pending} formNoValidate>Send a new code</button>
          </div>
        </>
      )}
      <p aria-live="polite" className="sr-only">{pending ? 'Working' : ''}</p>
    </form>
  );
}
