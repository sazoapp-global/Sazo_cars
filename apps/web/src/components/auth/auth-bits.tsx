// Small pieces shared by the log-in and create-account cards (original design).
import Link from 'next/link';

export function AuthTabs({ active, next }: { active: 'sign-in' | 'sign-up'; next: string }) {
  const q = next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  const cls = (on: boolean) => `flex-1 rounded-md py-2 text-center text-sm transition-all ${on ? 'bg-white font-bold text-ink shadow-sm' : 'font-semibold text-muted hover:text-ink'}`;
  return (
    <nav aria-label="Account" className="mt-6 flex gap-1 rounded-lg bg-soft p-1">
      <Link href={`/sign-in${q}`} aria-current={active === 'sign-in' ? 'page' : undefined} className={cls(active === 'sign-in')}>Sign In</Link>
      <Link href={`/sign-up${q}`} aria-current={active === 'sign-up' ? 'page' : undefined} className={cls(active === 'sign-up')}>Create Account</Link>
    </nav>
  );
}

export function GoogleButton({ next, label }: { next: string; label: string }) {
  return (
    <>
      <a href={`/auth/google/start?next=${encodeURIComponent(next)}`} className="btn btn-ghost mt-5 w-full !bg-white"><GoogleMark />{label}</a>
      <p className="divider mt-5">or with mobile / email</p>
    </>
  );
}

/** Ugandan mobile number with the design's flag and +256 prefix. Accepts 0772…, 772… or +256…. */
export function PhoneInput({ id, defaultValue, describedBy }: { id: string; defaultValue?: string; describedBy?: string }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-line bg-soft focus-within:border-primary-container focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(0,51,170,0.15)]">
      <span className="flex items-center gap-2 border-r border-line px-3 text-sm font-bold text-ink" aria-hidden><span className="text-lg leading-none">🇺🇬</span>+256</span>
      <input id={id} name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required defaultValue={defaultValue} placeholder="772 123 456"
        className="min-h-12 w-full bg-transparent px-3 text-[16px] outline-none" aria-describedby={describedBy} />
    </div>
  );
}

export function RememberDevice({ id }: { id: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-ink">
      <input id={id} type="checkbox" name="remember" defaultChecked className="h-5 w-5 rounded accent-[var(--color-primary-container)]" />Remember device
    </label>
  );
}

export function ModeSwitch({ mode, onChange }: { mode: 'phone' | 'email'; onChange: (m: 'phone' | 'email') => void }) {
  return (
    <button type="button" onClick={() => onChange(mode === 'phone' ? 'email' : 'phone')} className="text-sm font-semibold text-primary-container hover:underline">
      {mode === 'phone' ? 'Use email instead' : 'Use phone number'}
    </button>
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

export function Alert({ text, link }: { text?: string; link?: { href: string; label: string } }) {
  if (!text) return null;
  return <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill px-3 py-2 text-sm font-semibold text-bad-text">{text}{link && <> <Link href={link.href} className="link">{link.label}</Link></>}</p>;
}
