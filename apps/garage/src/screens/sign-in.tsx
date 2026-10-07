import { useState } from 'react';
import { ApiError, OfflineError, requestCode, verifyCode } from '../lib/api';

function toE164(input: string): string | undefined {
  const d = input.replace(/[\s\-().]/g, '');
  const e = d.startsWith('+') ? d : d.startsWith('256') ? `+${d}` : d.startsWith('0') ? `+256${d.slice(1)}` : /^7\d{8}$/.test(d) ? `+256${d}` : '';
  return /^\+[1-9]\d{7,14}$/.test(e) ? e : undefined;
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<'phone' | 'code' | 'name'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(undefined);
    try { await fn(); } catch (err) {
      if (err instanceof OfflineError) setError('No signal. Signing in needs the internet once; after that the app works offline.');
      else if (err instanceof ApiError && err.code === 'display_name_required') setStep('name');
      else if (err instanceof ApiError && err.status === 401) setError('That code is wrong or has expired.');
      else if (err instanceof ApiError && err.status === 429) setError('Too many codes requested. Wait a while and try again.');
      else setError('Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md p-4 pt-10">
      <p className="font-display text-3xl font-extrabold text-primary">SAZO Garage</p>
      <p className="mt-1 text-muted">Record jobs for your customers&apos; cars. Works without signal.</p>
      <form className="card mt-6 space-y-4 p-5" onSubmit={(e) => {
        e.preventDefault();
        if (step === 'phone') {
          const e164 = toE164(phone);
          if (!e164) { setError('Enter a phone number like 0772 123 456.'); return; }
          void run(async () => { await requestCode(e164); setPhone(e164); setStep('code'); });
        } else void run(async () => { await verifyCode(phone, code, step === 'name' ? name : undefined); onSignedIn(); });
      }}>
        {step === 'phone' && (<div><label htmlFor="phone" className="label">Your phone number</label>
          <input id="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="0772 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>)}
        {step === 'code' && (<div><p className="text-sm">Code sent to <span className="font-semibold tabular-nums">{phone}</span></p>
          <label htmlFor="code" className="label mt-2">6-digit code</label>
          <input id="code" className="field text-center !text-2xl tracking-[0.5em] tabular-nums" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></div>)}
        {step === 'name' && (<div><label htmlFor="name" className="label">Your name</label>
          <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <p className="mt-1 text-sm text-muted">Shown on every job you record (D-056).</p></div>)}
        {error && <p role="alert" className="text-sm font-semibold text-bad-text">{error}</p>}
        <button className="btn btn-primary w-full" type="submit" disabled={busy}>{step === 'phone' ? 'Send code' : step === 'code' ? 'Sign in' : 'Continue'}</button>
      </form>
    </div>
  );
}
