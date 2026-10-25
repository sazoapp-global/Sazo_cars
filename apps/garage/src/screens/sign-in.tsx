import { useEffect, useState } from 'react';
import { kv } from '../lib/db';
import { ApiError, OfflineError, addPhone, confirmPhone, passwordLogin, requestCode, secondStep, verifyCode, type NextStep, type SecondStep } from '../lib/api';

function toE164(input: string): string | undefined {
  const d = input.replace(/[\s\-().]/g, '');
  const e = d.startsWith('+') ? d : d.startsWith('256') ? `+${d}` : d.startsWith('0') ? `+256${d.slice(1)}` : /^7\d{8}$/.test(d) ? `+256${d}` : '';
  return /^\+[1-9]\d{7,14}$/.test(e) ? e : undefined;
}

const WEBSITE = import.meta.env.VITE_SAZO_WEB_URL ?? 'http://localhost:3001';

/**
 * Log in (D-100): phone code or email and password. No sign-up here: mechanics are added by their manager,
 * and managers register their business on the SAZO website. Everyone gets a second step on a new phone, and an
 * account with no phone adds one before going in (D-145).
 */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [step, setStep] = useState<'start' | 'code' | 'second' | 'add_phone' | 'add_code' | 'staff'>('start');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [second, setSecond] = useState<SecondStep>();
  const [secondCode, setSecondCode] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPhoneCode, setNewPhoneCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [idle, setIdle] = useState(false);
  useEffect(() => { void kv.get<boolean>('signedOutIdle').then((v) => setIdle(!!v)); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(undefined);
    try { await fn(); } catch (err) {
      if (err instanceof OfflineError) setError('No signal. Logging in needs the internet once; after that the app works offline.');
      else if (err instanceof ApiError && err.code === 'no_account') setError(method === 'phone'
        ? 'No SAZO account uses this number. Ask your manager to add you, or register your business on the SAZO website.'
        : 'No SAZO account uses this email.');
      else if (err instanceof ApiError && err.code === 'invalid_credentials') setError(err.message || 'Wrong email or password.');
      else if (err instanceof ApiError && err.code === 'account_locked') setError(err.message || 'Too many wrong passwords. Try again later.');
      else if (err instanceof ApiError && err.code === 'phone_in_use') setError('Another SAZO account uses this number.');
      else if (err instanceof ApiError && err.code === 'invalid_link') { setError('That took too long. Log in again.'); setStep('start'); }
      else if (err instanceof ApiError && err.status === 401) setError(step === 'second' && second?.channel === 'password' ? 'Wrong password.' : 'That code is wrong or has expired.');
      else if (err instanceof ApiError && err.status === 429) setError('Too many tries. Wait a while and try again.');
      else if (err instanceof ApiError && err.code === 'account_suspended') setError('This account is not active. Contact SAZO.');
      else setError('Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  const afterStep = (s: NextStep | undefined) => {
    if (!s) onSignedIn();
    else if (s.kind === 'second') { setSecond(s); setSecondCode(''); setStep('second'); }
    else if (s.kind === 'add_phone') { setSetupToken(s.setupToken); setStep('add_phone'); }
    else setStep('staff');
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 'staff') { setStep('start'); return; }
    if (step === 'second' && second) {
      void run(async () => afterStep(await secondStep(second.challengeId, secondCode.trim(), remember)));
    } else if (step === 'add_phone') {
      const e164 = toE164(newPhone);
      if (!e164) { setError('Enter a phone number like 0772 123 456.'); return; }
      void run(async () => { setSentTo((await addPhone(setupToken, e164)).sentTo); setNewPhone(e164); setNewPhoneCode(''); setStep('add_code'); });
    } else if (step === 'add_code') {
      void run(async () => afterStep(await confirmPhone(setupToken, newPhone, newPhoneCode)));
    } else if (method === 'email') {
      if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
      void run(async () => afterStep(await passwordLogin(email.trim(), password)));
    } else if (step === 'start') {
      const e164 = toE164(phone);
      if (!e164) { setError('Enter a phone number like 0772 123 456.'); return; }
      void run(async () => { await requestCode(e164); setPhone(e164); setStep('code'); });
    } else {
      void run(async () => afterStep(await verifyCode(phone, code)));
    }
  }

  const switchTo = (m: 'phone' | 'email') => { setMethod(m); setStep('start'); setError(undefined); };

  return (
    <div className="mx-auto max-w-md p-4 pt-10">
      <p className="font-display text-3xl font-extrabold text-primary">SAZO Garage</p>
      <p className="mt-1 text-muted">Record jobs for your customers&apos; cars. Works without signal.</p>
      <form className="card mt-6 space-y-4 p-5" onSubmit={submit} noValidate>
        <h1 className="font-display text-xl font-bold">{step === 'second' ? 'Confirm it’s you' : step === 'add_phone' || step === 'add_code' ? 'Add your phone' : step === 'staff' ? 'Set up on the website' : 'Log in'}</h1>
        {idle && step === 'start' && <p role="alert" className="rounded-lg border border-warn-line bg-warn-fill p-3 text-sm font-semibold text-warn-text">You were logged out after 4 hours without activity. Your jobs are still on this phone; log in again to carry on.</p>}
        {(step === 'start' || step === 'code') && (
          <div role="tablist" aria-label="How to log in" className="grid grid-cols-2 gap-1 rounded-lg bg-soft p-1">
            {(['phone', 'email'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => switchTo(m)}
                className={`min-h-10 rounded-md text-sm font-semibold ${method === m ? 'bg-white text-primary-container shadow' : 'text-muted'}`}>
                {m === 'phone' ? 'Phone code' : 'Email and password'}
              </button>
            ))}
          </div>
        )}
        {step === 'second' && second && (<div>
          <p className="text-sm">This is a new phone, so we check it&apos;s really you. {second.channel === 'password' ? 'Type your SAZO password as well.'
            : second.channel === 'authenticator' ? 'Type the code from your authenticator app, or a backup code.'
            : <>We sent a code {second.channel === 'sms' ? 'by SMS to' : 'by email to'} <span className="font-semibold">{second.sentTo}</span>.</>}</p>
          {second.channel === 'password' ? (<>
            <label htmlFor="second-code" className="label mt-2">Password</label>
            <input id="second-code" className="field" type="password" autoComplete="current-password" value={secondCode} onChange={(e) => setSecondCode(e.target.value)} autoFocus />
          </>) : second.channel === 'authenticator' ? (<>
            <label htmlFor="second-code" className="label mt-2">Code from the app, or a backup code</label>
            <input id="second-code" className="field text-center !text-xl tracking-widest" autoComplete="one-time-code" autoCapitalize="none" maxLength={14} value={secondCode} onChange={(e) => setSecondCode(e.target.value)} autoFocus />
          </>) : (<>
            <label htmlFor="second-code" className="label mt-2">6-digit code</label>
            <input id="second-code" className="field text-center !text-2xl tracking-[0.5em] tabular-nums" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={secondCode} onChange={(e) => setSecondCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </>)}
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1 h-4 w-4" />Remember this phone for 90 days (only if it&apos;s yours)</label>
        </div>)}
        {step === 'add_phone' && (<div>
          <p className="text-sm">SAZO now uses your phone to check it&apos;s you on a new phone and to reset a forgotten password. Add your number to carry on.</p>
          <label htmlFor="new-phone" className="label mt-2">Your phone number</label>
          <input id="new-phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="0772 123 456" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} autoFocus />
        </div>)}
        {step === 'add_code' && (<div>
          <p className="text-sm">Code sent to <span className="font-semibold tabular-nums">{sentTo}</span></p>
          <label htmlFor="new-phone-code" className="label mt-2">6-digit code</label>
          <input id="new-phone-code" className="field text-center !text-2xl tracking-[0.5em] tabular-nums" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={newPhoneCode} onChange={(e) => setNewPhoneCode(e.target.value.replace(/\D/g, ''))} autoFocus />
        </div>)}
        {step === 'staff' && (
          <p className="text-sm">SAZO staff set up an authenticator app before their first log-in. Log in once on the SAZO website to set it up, then come back here. <a href={`${WEBSITE}/sign-in`} className="font-semibold text-primary-container underline">Open the SAZO website</a></p>
        )}
        {step === 'start' && method === 'phone' && (<div><label htmlFor="phone" className="label">Your phone number</label>
          <input id="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="0772 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>)}
        {step === 'code' && (<div><p className="text-sm">Code sent to <span className="font-semibold tabular-nums">{phone}</span></p>
          <label htmlFor="code" className="label mt-2">6-digit code</label>
          <input id="code" className="field text-center !text-2xl tracking-[0.5em] tabular-nums" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></div>)}
        {(step === 'start' || step === 'code') && method === 'email' && (<>
          <div><label htmlFor="email" className="label">Email</label>
            <input id="email" className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label htmlFor="password" className="label">Password</label>
            <input id="password" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </>)}
        {error && <p role="alert" className="text-sm font-semibold text-bad-text">{error}</p>}
        <button className="btn btn-primary w-full" type="submit" disabled={busy}>
          {step === 'second' ? 'Confirm' : step === 'add_phone' ? 'Send code' : step === 'add_code' ? 'Confirm and carry on' : step === 'staff' ? 'Back to log in' : method === 'phone' && step === 'start' ? 'Send code' : 'Log in'}
        </button>
        {method === 'email' && (step === 'start' || step === 'code') && <p className="text-center text-sm"><a href={`${WEBSITE}/forgot-password`} className="font-semibold text-primary-container underline">Forgot password?</a></p>}
      </form>
      <p className="mt-4 text-center text-sm text-muted">No account? Your manager adds you from the Staff screen. Managers: <a href={`${WEBSITE}/sign-up`} className="font-semibold text-primary-container underline">create an account</a> and register your business on the SAZO website.</p>
    </div>
  );
}
