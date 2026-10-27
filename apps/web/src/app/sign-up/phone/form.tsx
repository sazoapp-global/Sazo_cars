'use client';
// Straight after an email sign-up: confirm the mobile number with a code (27 Oct 2026).
import { useActionState } from 'react';
import { Alert, PhoneInput } from '@/components/auth/auth-bits';
import { Icon } from '@/components/icon';
import { confirmSignUpPhone, type SignUpPhoneState } from '../actions';

export function ConfirmPhoneForm({ initial }: { initial: SignUpPhoneState }) {
  const [state, action, pending] = useActionState<SignUpPhoneState, FormData>(confirmSignUpPhone, initial);
  return (
    <form action={action} className="mt-5 space-y-4" noValidate>
      {state.step === 'phone' ? (
        <>
          <div>
            <label htmlFor="su-phone-confirm" className="label">Mobile number</label>
            <PhoneInput id="su-phone-confirm" defaultValue={state.phoneInput} describedBy="su-phone-confirm-help" />
            <p id="su-phone-confirm-help" className="mt-1 text-sm text-muted">We&apos;ll send a 6-digit code by SMS to confirm it.</p>
          </div>
          <Alert text={state.error} />
          <button type="submit" name="intent" value="send" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Sending…' : <>Send code<Icon name="arrow_forward" /></>}</button>
        </>
      ) : (
        <>
          <p className="text-sm">We sent a code to <span className="font-semibold tabular-nums">{state.phone.replace(/^\+256/, '0')}</span>.</p>
          <div>
            <label htmlFor="su-phone-code" className="label">6-digit code</label>
            <input id="su-phone-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
              className="field text-center !text-2xl tracking-[0.5em] tabular-nums" />
          </div>
          <Alert text={state.error} />
          <button type="submit" name="intent" value="verify" className="btn btn-focal w-full !text-base shadow-sm" disabled={pending}>{pending ? 'Checking…' : <>Confirm and carry on<Icon name="arrow_forward" /></>}</button>
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="intent" value="back" className="btn btn-ghost" disabled={pending} formNoValidate>Change number</button>
            <button type="submit" name="intent" value="resend" className="btn btn-ghost" disabled={pending} formNoValidate>Send a new code</button>
          </div>
        </>
      )}
      <div className="text-center text-sm">
        <button type="submit" name="intent" value="later" className="link" formNoValidate disabled={pending}>Do it later</button>
        <p className="text-muted">You will be asked for it the next time you log in.</p>
      </div>
    </form>
  );
}
