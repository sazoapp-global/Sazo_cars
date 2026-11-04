// Account settings (D-102): used by the Settings panel inside any page and by /account. Every form carries
// `back`, the address to return to, so a change keeps you on the page you opened Settings from.
import { unstable_rethrow } from 'next/navigation';
import { formatDate } from '@sazo/contracts';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { Icon, type IconName } from '@/components/icon';
import { ThemeChoice } from '@/components/theme/theme-choice';
import { api } from '@/lib/api';
import { deviceName, localPhone } from '@/lib/phone';
import type { Me } from '@/lib/types';
import { signOut } from '../sign-in/actions';
import { confirmPhone, deleteAccount, rename, sendPhoneCode, setEmail, setPassword, setTexts, signOutDevice, signOutOthers } from './actions';

const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting for SAZO approval', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };
type Profile = {
  displayName: string; initials: string; surname: string | null; firstName: string | null; middleName: string | null;
  gender: 'male' | 'female' | null; dateOfBirth: string | null; phone: string | null; email: string | null; emailVerified: boolean;
  hasPassword: boolean; hasGoogle: boolean; strongPasswordRequired: boolean;
  progress: { percent: number; items: { key: string; label: string; done: boolean }[] };
};
/** Short names for the profile steps on phones. */
const SHORT: Record<string, string> = { details: 'Details', phone: 'Phone', email: 'Email', password: 'Password' };
type Device = { sessionId: string; device: string | null; signedInAt: string; lastUsedAt: string; current: boolean };
export type SettingsQuery = { done?: string; error?: string; newPhone?: string; section?: string };

/**
 * The profile steps as the enquiry page's progress line (D-160): finished steps in lime with a tick, the next one
 * with a blue ring, its number and "Do this next", the rest waiting.
 */
function ProfileLine({ items, href }: { items: Profile['progress']['items']; href: (id: string) => string }) {
  const done = items.filter((i) => i.done).length;
  const at = items.findIndex((i) => !i.done);
  return (
    <section className="card p-5 md:p-6" aria-labelledby="progress">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="progress" className="font-display text-lg font-bold">Your profile</h2>
        <span className={`font-extrabold ${done === items.length ? 'text-ok-text' : 'text-primary-container'}`}>{done === items.length ? 'Complete' : `${done} of ${items.length} done`}</span>
      </div>
      <div role="progressbar" aria-labelledby="progress" aria-valuenow={Math.round((done / Math.max(1, items.length)) * 100)} aria-valuemin={0} aria-valuemax={100} className="sr-only" />
      <ol className="mt-5 grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} aria-label="Profile steps">
        {items.map((it, n) => (
          <li key={it.key} className="relative text-center" aria-current={n === at ? 'step' : undefined}>
            <span aria-hidden className={`absolute top-[15px] h-1 ${n === 0 ? 'left-1/2' : 'left-0'} ${n === items.length - 1 ? 'right-1/2' : 'right-0'} ${it.done || n === at ? 'bg-primary-container' : 'bg-line'}`} />
            <span className={`relative mx-auto grid size-8 place-items-center rounded-full font-extrabold ${it.done ? 'border-[3px] border-primary-container bg-lime text-primary' : n === at ? 'border-[3px] border-primary-container bg-card text-primary' : 'border-2 border-line bg-card text-muted'}`}>
              {it.done ? <Icon name="check" size={16} label="Done" /> : n + 1}
            </span>
            <p className={`mt-2.5 leading-snug ${n === at ? 'font-extrabold text-primary' : 'font-semibold text-on-surface/70'}`}>
              <span className="sm:hidden">{SHORT[it.key] ?? it.label}</span><span className="max-sm:hidden">{it.label}</span>
            </p>
            {n === at && <Link href={href(it.key)} className="link mt-1 inline-block text-sm">Do this next</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * `inPanel`: drawn for the Settings panel by a server action, which cannot carry the page's own client
 * pieces, so the appearance choice is left as an empty slot that the panel fills in on the device.
 */
export async function AccountSettings({ sp, back, inPanel = false }: { sp: SettingsQuery; back: string; inPanel?: boolean }) {
  const me = await api<Me>('/me', { auth: true }).catch((e) => { unstable_rethrow(e); return undefined; }); // a device whose sign-in ended goes to log in
  if (!me) return <p className="card p-4">Sign in again to see your settings. <a href="/sign-in" className="link">Log in</a></p>;
  if (me.needsDetails.length) return <p className="card p-4">Add your details first. <a href={`/account/complete?next=${encodeURIComponent(back)}`} className="link">Add your details</a></p>;
  const [profile, prefs, devices, authenticator] = await Promise.all([
    api<Profile>('/me/profile', { auth: true }),
    api<{ visitConfirmationTexts: boolean }>('/me/preferences', { auth: true }),
    api<{ items: Device[] }>('/me/sessions', { auth: true }).then((r) => r.items),
    api<{ required: boolean; setUp: boolean; backupCodesLeft: number }>('/me/authenticator', { auth: true }).catch(() => undefined),
  ]);
  const newPhone = sp.newPhone && /^\+[1-9]\d{7,14}$/.test(sp.newPhone) ? sp.newPhone : undefined;

  // Option A (D-160): a menu of settings, each with what it holds now; the chosen one beside it (?section=…).
  const at = new URL(back, 'http://x');
  for (const k of ['done', 'error', 'newPhone', 'section']) at.searchParams.delete(k);
  const menuHref = `${at.pathname}${at.search}`;
  const sectionHref = (id: string) => { const u = new URL(menuHref, 'http://x'); u.searchParams.set('section', id); return `${u.pathname}${u.search}`; };
  const dataHref = menuHref.includes('panel=settings') ? menuHref.replace('panel=settings', 'panel=data') : `${menuHref}${menuHref.includes('?') ? '&' : '?'}panel=data`;
  type Item = { id: string; title: string; icon: IconName; sum: string };
  const items: Item[] = [
    { id: 'details', title: 'Your details', icon: 'person', sum: profile.displayName },
    { id: 'phone', title: 'Phone number', icon: 'call', sum: profile.phone ? localPhone(profile.phone) : 'Not added' },
    { id: 'email', title: 'Email', icon: 'sms', sum: profile.email ? `${profile.email}${profile.emailVerified ? '' : ' (not confirmed)'}` : 'Not added' },
    ...(me.memberships.length ? [{ id: 'orgs', title: 'Your businesses', icon: 'storefront' as IconName, sum: me.memberships.map((m) => m.organisationName).join(', ') }] : []),
    { id: 'password', title: 'Password', icon: 'key', sum: profile.hasPassword ? 'Set' : 'Not set' },
    ...(authenticator?.required ? [{ id: 'authenticator', title: 'Authenticator app', icon: 'shield' as IconName, sum: authenticator.setUp ? 'Set up' : 'Not set up yet' }] : []),
    { id: 'devices', title: 'Signed-in devices', icon: 'devices', sum: `${devices.length} ${devices.length === 1 ? 'device' : 'devices'}` },
    { id: 'appearance', title: 'Appearance', icon: 'contrast', sum: 'Light, dark or as the phone' },
    { id: 'texts', title: 'Texts', icon: 'notifications', sum: `Garage visit confirmations ${prefs.visitConfirmationTexts ? 'on' : 'off'}` },
    { id: 'data', title: 'Your data', icon: 'description', sum: 'See it, download it, or delete your account' },
  ];
  const chosen = items.find((i) => i.id === sp.section);
  const open = chosen ?? items[0]!;
  const here = sectionHref(open.id);

  const BODY: Record<string, React.ReactNode> = {
    details: (
      <section className="card leading-relaxed md:!p-6 space-y-3 p-5" aria-labelledby="details">
        <h2 id="details" className="font-display text-lg font-semibold">Your details</h2>
        <form action={rename} data-draft="settings-names" className="space-y-3"><input type="hidden" name="back" value={here} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label htmlFor="surname" className="label">Surname</label>
              <input id="surname" name="surname" required maxLength={60} defaultValue={profile.surname ?? ''} className="field" autoComplete="family-name" /></div>
            <div><label htmlFor="firstName" className="label">Given name</label>
              <input id="firstName" name="firstName" required maxLength={60} defaultValue={profile.firstName ?? ''} className="field" autoComplete="given-name" /></div>
            <div><label htmlFor="middleName" className="label">Middle name</label>
              <input id="middleName" name="middleName" maxLength={60} defaultValue={profile.middleName ?? ''} className="field" autoComplete="additional-name" /></div>
          </div>
          <button className="btn btn-ghost">Save names</button>
        </form>
        <p className="text-sm text-muted">Shown as “{profile.displayName}”. Garages you work with see your name; on reviews only your given name is shown.</p>
        <dl className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <div><dt className="label">Gender</dt><dd>{profile.gender === 'male' ? 'Male' : profile.gender === 'female' ? 'Female' : 'Not given'}</dd></div>
          <div><dt className="label">Date of birth</dt><dd className="tabular-nums">{profile.dateOfBirth ? formatDate(profile.dateOfBirth) : 'Not given'}</dd></div>
        </dl>
        <p className="text-sm text-muted">Gender and date of birth identify you, so only SAZO staff can change them. Contact SAZO if they are wrong.</p>

      </section>
    ),
    phone: (
      <section className="card leading-relaxed md:!p-6 space-y-3 p-5" aria-labelledby="phone-heading">
        <h2 id="phone-heading" className="font-display text-lg font-semibold">Phone number</h2>
        <div>
          <p className="font-semibold tabular-nums">{profile.phone ? localPhone(profile.phone) : 'Not given'}</p>
          {newPhone ? (
            <form action={confirmPhone} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"><input type="hidden" name="back" value={here} />
              <input type="hidden" name="phone" value={newPhone} />
              <div className="flex-1"><label htmlFor="code" className="label">Code we sent to {localPhone(newPhone)}</label>
                <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className="field tabular-nums" /></div>
              <button className="btn btn-primary">Use this number</button>
              <a href={here} className="btn btn-ghost">Cancel</a>
            </form>
          ) : (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-primary-container">{profile.phone ? 'Change phone number' : 'Add a phone number'}</summary>
              <form action={sendPhoneCode} data-draft="settings-phone" className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"><input type="hidden" name="back" value={here} />
                <div className="flex-1"><label htmlFor="phone" className="label">{profile.phone ? 'New phone number' : 'Phone number'}</label>
                  <input id="phone" name="phone" type="tel" inputMode="tel" required placeholder="0772 123 456" className="field" autoComplete="tel" /></div>
                <button className="btn btn-ghost">Send a code</button>
              </form>
              <p className="mt-1 text-sm text-muted">We send a code to the new number. Once it&apos;s confirmed you sign in with it, your other devices are signed out, and your old number gets a text. If SAZO confirmed a car as yours by phone number, you&apos;ll need to confirm it again.</p>
            </details>
          )}
        </div>
      </section>
    ),
    email: (
      <section className="card leading-relaxed md:!p-6 space-y-3 p-5" aria-labelledby="email-heading">
        <h2 id="email-heading" className="font-display text-lg font-semibold">Email</h2>
        {profile.email ? (
          <p><span className="font-semibold">{profile.email}</span>{' '}
            {profile.emailVerified
              ? <span className="chip border-ok-line bg-ok-fill text-ok-text">Confirmed</span>
              : <span className="chip border-warn-line bg-warn-fill text-warn-text">Waiting for you to open the link</span>}</p>
        ) : <p className="text-muted">No email yet. Add one so you can log in with a password and reset it if you forget.</p>}
        <form action={setEmail} data-draft="settings-email" className="flex flex-col gap-2 sm:flex-row sm:items-end"><input type="hidden" name="back" value={here} />
          <div className="flex-1"><label htmlFor="email" className="label">{profile.email && profile.emailVerified ? 'New email address' : 'Email address'}</label>
            <input id="email" name="email" type="email" required autoComplete="email" defaultValue={profile.emailVerified ? '' : profile.email ?? ''} className="field" /></div>
          <button className="btn btn-ghost">{profile.email && !profile.emailVerified ? 'Send the link again' : 'Send a confirmation link'}</button>
        </form>
      </section>
    ),
    orgs: (
        <section className="card leading-relaxed md:!p-6 p-5" aria-labelledby="orgs">
          <h2 id="orgs" className="font-display text-lg font-semibold">Your businesses</h2>
          <ul className="mt-2 divide-y divide-line">
            {me.memberships.map((m) => (
              <li key={m.organisationId} className="flex items-center justify-between gap-3 py-2">
                <a href={m.organisationType === 'dealer' && m.organisationStatus === 'approved' ? `/dealer/${m.organisationId}` : `/business/${m.organisationId}`} className="link">{m.organisationName}</a>
                <span className="text-sm text-muted">{ORG_STATUS[m.organisationStatus] ?? m.organisationStatus}</span>
              </li>
            ))}
          </ul>
        </section>
    ),
    password: (
      <section className="card leading-relaxed md:!p-6 space-y-3 p-5" aria-labelledby="password-heading">
        <h2 id="password-heading" className="font-display text-lg font-semibold">Password</h2>
        <p className="text-muted">{profile.hasPassword ? 'You can log in with your email and password.' : 'No password yet. Set one to log in with your email.'}
          {profile.hasGoogle && ' You can also continue with Google.'}</p>
        <form action={setPassword} className="space-y-3"><input type="hidden" name="back" value={here} />
          {profile.hasPassword && (
            <div><label htmlFor="currentPassword" className="label">Current password</label>
              <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className="field" /></div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="newPassword" className="label">New password</label>
              <input id="newPassword" name="newPassword" type="password" required minLength={profile.strongPasswordRequired ? 12 : 8} autoComplete="new-password" className="field" aria-describedby="newpw-help" /></div>
            <div><label htmlFor="confirmPassword" className="label">New password again</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" className="field" /></div>
          </div>
          <p id="newpw-help" className="text-sm text-muted">At least {profile.strongPasswordRequired ? 12 : 8} characters{profile.strongPasswordRequired ? '. Your role can change car histories, so it needs a longer password' : ''}.</p>
          <button className="btn btn-ghost">{profile.hasPassword ? 'Change password' : 'Set password'}</button>
        </form>
      </section>
    ),
    authenticator: authenticator?.required ? (
        <section className="card leading-relaxed md:!p-6 p-5" aria-labelledby="authenticator">
          <h2 id="authenticator" className="font-display text-lg font-semibold">Authenticator app</h2>
          <p className="mt-1 text-muted">As SAZO staff you confirm it&apos;s you with an authenticator app on a new device, never an SMS code.</p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Icon name={authenticator.setUp ? 'check_circle' : 'info'} size={18} className={authenticator.setUp ? 'text-ok-text' : 'text-label'} />
            {authenticator.setUp ? `Set up. ${authenticator.backupCodesLeft} of 10 backup codes left.` : 'Not set up yet. You set it up at your next log-in.'}
          </p>
          <p className="mt-2 text-sm text-muted">Lost your phone, or running out of backup codes? Ask a SAZO administrator to clear your app; you then set up a new one at your next log-in.</p>
        </section>
    ) : null,
    devices: (
      <section className="card leading-relaxed md:!p-6 p-5" aria-labelledby="devices">
        <h2 id="devices" className="font-display text-lg font-semibold">Signed-in devices</h2>
        <ul className="mt-2 divide-y divide-line">
          {devices.map((d) => (
            <li key={d.sessionId} className="flex items-center justify-between gap-3 py-2">
              <span><span className="font-semibold">{deviceName(d.device)}</span>{d.current && <span className="chip ml-2 border-ok-line bg-ok-fill text-ok-text">This device</span>}
                <span className="block text-sm text-muted">Signed in {formatDate(d.signedInAt)} · last used {formatDate(d.lastUsedAt)}</span></span>
              {!d.current && <form action={signOutDevice}><input type="hidden" name="back" value={here} /><input type="hidden" name="id" value={d.sessionId} /><button className="btn btn-ghost !min-h-10 text-sm" aria-label={`Sign out ${deviceName(d.device)}`}>Sign out</button></form>}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {devices.length > 1 && <form action={signOutOthers}><input type="hidden" name="back" value={here} /><button className="btn btn-ghost">Sign out all other devices</button></form>}
          <form action={signOut} data-clear-drafts><button type="submit" className="btn btn-ghost"><Icon name="logout" />Sign out here</button></form>
        </div>
      </section>
    ),
    appearance: (
      <section className="card leading-relaxed md:!p-6 space-y-3 p-5" aria-labelledby="appearance">
        <h2 id="appearance" className="font-display text-lg font-semibold">Appearance</h2>
        {inPanel ? <div data-slot="appearance" /> : <ThemeChoice />}
      </section>
    ),
    texts: (
      <section className="card leading-relaxed md:!p-6 p-5" aria-labelledby="texts">
        <h2 id="texts" className="font-display text-lg font-semibold">Texts</h2>
        <form action={setTexts} className="mt-2 space-y-3"><input type="hidden" name="back" value={here} />
          <label className="flex items-start gap-3">
            <input type="checkbox" name="visitTexts" defaultChecked={prefs.visitConfirmationTexts} className="mt-1 h-6 w-6 shrink-0 accent-[#0033aa]" />
            <span><span className="font-semibold">Ask me to confirm garage visits</span><br /><span className="text-sm text-muted">When a garage records work on your car, SAZO can text you once to confirm it. Turning this off applies even if a garage says you agreed.</span></span>
          </label>
          <button className="btn btn-ghost">Save</button>
        </form>
        <p className="mt-2 text-sm text-muted">Sign-in codes and texts about your own requests (businesses, car claims) are always sent.</p>
      </section>
    ),
    data: (
      <section className="card leading-relaxed md:!p-6 p-5" aria-labelledby="data">
        <h2 id="data" className="font-display text-lg font-semibold">Your data</h2>
        <p className="mt-1 text-muted">See what SAZO holds about you: your details, your businesses, saved cars, shared reports, cars you own, reviews and devices. Download it as a PDF or an Excel file.</p>
        {/* Opens in the same white space as Settings (D-157), never a new page. */}
        <a href={dataHref} className="btn btn-ghost mt-3"><Icon name="description" />Download my data</a>

        <details className="mt-5 rounded-lg border border-bad-line p-3">
          <summary className="cursor-pointer font-semibold text-bad-text">Delete my account</summary>
          <div className="mt-2 space-y-2 text-sm">
            <p>This can&apos;t be undone. SAZO will delete your name and phone number, sign out all your devices, and remove your saved cars, shared links (they stop working), car claims and reviews. The encrypted record SAZO keeps for your phone number is erased.</p>
            <p>Records you entered for a business (for example garage jobs) stay in each car&apos;s history, without your name. If you are the only manager of a business with staff, make someone else a manager first.</p>
            <form action={deleteAccount} className="flex flex-col gap-2 sm:flex-row sm:items-end"><input type="hidden" name="back" value={here} />
              <div className="flex-1"><label htmlFor="confirm" className="label">Type DELETE to confirm</label>
                <input id="confirm" name="confirm" required autoComplete="off" className="field" /></div>
              <button className="btn border-bad-line bg-bad-fill text-bad-text">Delete my account</button>
            </form>
          </div>
        </details>
      </section>
    ),
  };
  const line = <ProfileLine items={profile.progress.items} href={sectionHref} />;

  return (
    <div className="space-y-4">
      {!inPanel && (
        <div className="flex items-center gap-3">
          <span className="avatar avatar-lg" aria-hidden>{profile.initials}</span>
          <div><h1 className="font-display text-2xl font-bold">{profile.displayName}</h1><p className="text-sm text-muted">Settings</p></div>
        </div>
      )}
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {/* One grid: the profile line beside the menu on computers and above it on phones; the chosen setting under the
          line on computers. On phones a chosen setting opens in place of the menu, with Back to the menu. */}
      <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className={`lg:col-start-2 lg:row-start-1 ${chosen ? 'max-lg:hidden' : ''}`}>{line}</div>
        <nav aria-label="Settings" className={`card p-2.5 lg:sticky lg:top-16 lg:col-start-1 lg:row-span-2 lg:row-start-1 ${chosen ? 'max-lg:hidden' : ''}`}>
          <ul className="space-y-1">
            {items.map((i) => {
              const on = i.id === open.id;
              return (
                <li key={i.id}>
                  <Link href={sectionHref(i.id)} scroll={false} aria-current={on ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 ${on ? 'lg:bg-primary-container lg:text-white' : 'hover:bg-soft'}`}>
                    <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${on ? 'bg-soft text-primary-container lg:bg-white/15 lg:text-white' : 'bg-soft text-primary-container'}`}><Icon name={i.icon} size={20} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-snug">{i.title}</span>
                      <span className={`block truncate text-[13px] leading-snug ${on ? 'text-muted lg:text-white/80' : 'text-muted'}`}>{i.sum}</span>
                    </span>
                    <Icon name="chevron_right" size={18} className="shrink-0 text-label lg:hidden" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={`min-w-0 space-y-4 lg:col-start-2 lg:row-start-2 ${chosen ? '' : 'max-lg:hidden'}`}>
          {/* In the panel the Back above the title does this on phones; the page of its own has it here. */}
          {chosen && !inPanel && <BackButton href={menuHref} scroll={false} className="lg:!hidden" />}
          {BODY[open.id]}
        </div>
      </div>
    </div>
  );
}
