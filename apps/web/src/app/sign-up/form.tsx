'use client';
import { useActionState, useState } from 'react';
import { Alert, AuthTabs, GoogleButton, ModeSwitch, PhoneInput, RememberDevice } from '@/components/auth/auth-bits';
import { PasswordField } from '@/components/auth/password-field';
import { Icon } from '@/components/icon';
import { PersonFields } from '@/components/person-fields';
import { signUpWithEmail, signUpWithPhone, type EmailSignUpState, type PhoneSignUpState } from './actions';

/** Create Account (D-100, D-101): mobile number + code or email + password, with names, gender and date of birth (18+). */
export function SignUpPanel({ next, google }: { next: string; google: boolean }) {
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const login = `/sign-in${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
  return (
    <>
      <h1 className="mt-6 font-display text-3xl font-extrabold text-ink">Create your account</h1>
      <p className="mt-1 text-muted">Check cars, compare them and avoid bad buys in Uganda. Free while SAZO is in testing.</p>
      <AuthTabs active="sign-up" next={next} />
      {google ? <GoogleButton next={next} label="Sign up with Google" /> : <div className="mt-5" />}
      {mode === 'phone' ? <PhoneForm next={next} login={login} mode={mode} setMode={setMode} /> : <EmailForm next={next} login={login} mode={mode} setMode={setMode} />}
    </>
  );
}

type FormProps = { next: string; login: string; mode: 'phone' | 'email'; setMode: (m: 'phone' | 'email') => void };

function EmailForm({ next, login, mode, setMode }: FormProps) {
  const [state, action, pending] = useActionState<EmailSignUpState, FormData>(signUpWithEmail, {});
  const e = state.errors ?? {};
  return (
    <form action={action} data-draft="sign-up" className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <PersonFields values={state.values} errors={e} idPrefix="em-" />
      <div>
        <div className="mb-1.5 flex items-baseline justify-between"><label htmlFor="su-email" className="label !mb-0">Email</label><ModeSwitch mode={mode} onChange={setMode} /></div>
        <input id="su-email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} className="field !bg-soft focus:!bg-card" aria-invalid={!!e.email} />
        {e.email && <p className="mt-1 text-sm font-semibold text-bad-text">{e.email}</p>}
      </div>
      <PasswordField id="su-password" name="password" label="Password" autoComplete="new-password" minLength={8} error={e.password} describedBy="pw-help" />
      <PasswordField id="su-confirm" name="confirm" label="Password again" autoComplete="new-password" error={e.confirm} />
      <p id="pw-help" className="-mt-2 text-sm text-muted">At least 8 characters. A short sentence is easy to remember and hard to guess.</p>
      <RememberDevice id="remember-su-email" />
      <Alert text={state.error} link={state.exists ? { href: login, label: 'Sign in' } : undefined} />
      <button type="submit" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Creating account…' : <>Create Free Account<Icon name="arrow_forward" /></>}</button>
    </form>
  );
}

function PhoneForm({ next, login, mode, setMode }: FormProps) {
  const [state, action, pending] = useActionState<PhoneSignUpState, FormData>(signUpWithPhone, { step: 'details' });
  return (
    <form action={action} data-draft="sign-up" className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.step === 'details' ? (
        <>
          <PersonFields values={state.values} errors={state.errors} idPrefix="ph-" />
          <div>
            <div className="mb-1.5 flex items-baseline justify-between"><label htmlFor="su-phone" className="label !mb-0">Mobile number</label><ModeSwitch mode={mode} onChange={setMode} /></div>
            <PhoneInput id="su-phone" defaultValue={state.values?.phone} describedBy="su-phone-help" />
            <p id="su-phone-help" className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code by SMS. You can add an email and password later.</p>
            {state.errors?.phone && <p className="mt-1 text-sm font-semibold text-bad-text">{state.errors.phone}</p>}
          </div>
          <RememberDevice id="remember-su-phone" />
          <Alert text={state.error} link={state.exists ? { href: login, label: 'Sign in' } : undefined} />
          <button type="submit" name="intent" value="send" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Sending…' : <>Send code<Icon name="arrow_forward" /></>}</button>
        </>
      ) : (
        <>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.phone}</span>.</p>
          <div>
            <label htmlFor="su-code" className="label">6-digit code</label>
            <input id="su-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
              className="field !bg-soft text-center !text-2xl tracking-[0.5em] tabular-nums focus:!bg-card" />
          </div>
          <Alert text={state.error} />
          <button type="submit" name="intent" value="verify" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Creating account…' : <>Create Free Account<Icon name="arrow_forward" /></>}</button>
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
