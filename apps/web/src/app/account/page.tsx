import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';
import { deviceName, localPhone } from '@/lib/phone';
import type { Me } from '@/lib/types';
import { signOut } from '../sign-in/actions';
import { confirmPhone, deleteAccount, rename, sendPhoneCode, setTexts, signOutDevice, signOutOthers } from './actions';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting for SAZO approval', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };
type Profile = { displayName: string; phone: string | null };
type Device = { sessionId: string; device: string | null; signedInAt: string; lastUsedAt: string; current: boolean };
type SP = Promise<{ done?: string; error?: string; newPhone?: string }>;

export default async function Account({ searchParams }: { searchParams: SP }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/account');
  const sp = await searchParams;
  const me = await api<Me>('/me', { auth: true }).catch(() => undefined);
  if (!me) redirect('/sign-in?next=/account');
  const [profile, prefs, devices] = await Promise.all([
    api<Profile>('/me/profile', { auth: true }),
    api<{ visitConfirmationTexts: boolean }>('/me/preferences', { auth: true }),
    api<{ items: Device[] }>('/me/sessions', { auth: true }).then((r) => r.items),
  ]);
  const newPhone = sp.newPhone && /^\+[1-9]\d{7,14}$/.test(sp.newPhone) ? sp.newPhone : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Hello, {me.displayName}</h1>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      <div className="flex flex-wrap gap-2">
        <a href="/my-cars" className="btn btn-ghost">My cars</a>
        <a href="/saved" className="btn btn-ghost">Saved cars</a>
        <a href="/shares" className="btn btn-ghost">Shared reports</a>
        <a href="/business/register" className="btn btn-ghost">Register a business</a>
        <a href="/partner" className="btn btn-ghost">Send records (data partners)</a>
      </div>

      {me.memberships.length > 0 && (
        <section className="card p-5" aria-labelledby="orgs">
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
      )}

      <section className="card space-y-3 p-5" aria-labelledby="details">
        <h2 id="details" className="font-display text-lg font-semibold">Your details</h2>
        <form action={rename} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1"><label htmlFor="name" className="label">Your name</label>
            <input id="name" name="name" required minLength={2} maxLength={120} defaultValue={profile.displayName} className="field" autoComplete="name" /></div>
          <button className="btn btn-ghost">Save name</button>
        </form>
        <p className="text-sm text-muted">Garages you work with see your name. On reviews, only your first name is shown.</p>

        <div className="border-t border-line pt-3">
          <p className="label">Phone number</p>
          <p className="font-semibold tabular-nums">{profile.phone ? localPhone(profile.phone) : '—'}</p>
          {newPhone ? (
            <form action={confirmPhone} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="phone" value={newPhone} />
              <div className="flex-1"><label htmlFor="code" className="label">Code we sent to {localPhone(newPhone)}</label>
                <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} className="field tabular-nums" /></div>
              <button className="btn btn-primary">Use this number</button>
              <a href="/account" className="btn btn-ghost">Cancel</a>
            </form>
          ) : (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-primary-container">Change phone number</summary>
              <form action={sendPhoneCode} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1"><label htmlFor="phone" className="label">New phone number</label>
                  <input id="phone" name="phone" type="tel" inputMode="tel" required placeholder="0772 123 456" className="field" autoComplete="tel" /></div>
                <button className="btn btn-ghost">Send a code</button>
              </form>
              <p className="mt-1 text-sm text-muted">We send a code to the new number. Once it&apos;s confirmed you sign in with it, your other devices are signed out, and your old number gets a text. If SAZO confirmed a car as yours by phone number, you&apos;ll need to confirm it again.</p>
            </details>
          )}
        </div>
      </section>

      <section className="card p-5" aria-labelledby="texts">
        <h2 id="texts" className="font-display text-lg font-semibold">Texts</h2>
        <form action={setTexts} className="mt-2 space-y-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="visitTexts" defaultChecked={prefs.visitConfirmationTexts} className="mt-1 h-6 w-6 shrink-0 accent-[#0033aa]" />
            <span><span className="font-semibold">Ask me to confirm garage visits</span><br /><span className="text-sm text-muted">When a garage records work on your car, SAZO can text you once to confirm it. Turning this off applies even if a garage says you agreed.</span></span>
          </label>
          <button className="btn btn-ghost">Save</button>
        </form>
        <p className="mt-2 text-sm text-muted">Sign-in codes and texts about your own requests (businesses, car claims) are always sent.</p>
      </section>

      <section className="card p-5" aria-labelledby="devices">
        <h2 id="devices" className="font-display text-lg font-semibold">Signed-in devices</h2>
        <ul className="mt-2 divide-y divide-line">
          {devices.map((d) => (
            <li key={d.sessionId} className="flex items-center justify-between gap-3 py-2">
              <span><span className="font-semibold">{deviceName(d.device)}</span>{d.current && <span className="chip ml-2 border-ok-line bg-ok-fill text-ok-text">This device</span>}
                <span className="block text-sm text-muted">Signed in {formatDate(d.signedInAt)} · last used {formatDate(d.lastUsedAt)}</span></span>
              {!d.current && <form action={signOutDevice}><input type="hidden" name="id" value={d.sessionId} /><button className="btn btn-ghost !min-h-10 text-sm" aria-label={`Sign out ${deviceName(d.device)}`}>Sign out</button></form>}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {devices.length > 1 && <form action={signOutOthers}><button className="btn btn-ghost">Sign out all other devices</button></form>}
          <form action={signOut}><button type="submit" className="btn btn-ghost"><Icon name="logout" />Sign out here</button></form>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="data">
        <h2 id="data" className="font-display text-lg font-semibold">Your data</h2>
        <p className="mt-1 text-muted">Download a copy of what SAZO holds about you: your details, saved cars, shared reports, cars you own, reviews and devices.</p>
        <a href="/account/export" className="btn btn-ghost mt-3" download><Icon name="description" />Download my data</a>

        <details className="mt-5 rounded-lg border border-bad-line p-3">
          <summary className="cursor-pointer font-semibold text-bad-text">Delete my account</summary>
          <div className="mt-2 space-y-2 text-sm">
            <p>This can&apos;t be undone. SAZO will delete your name and phone number, sign out all your devices, and remove your saved cars, shared links (they stop working), car claims and reviews. The encrypted record SAZO keeps for your phone number is erased.</p>
            <p>Records you entered for a business (for example garage jobs) stay in each car&apos;s history, without your name. If you are the only manager of a business with staff, make someone else a manager first.</p>
            <form action={deleteAccount} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1"><label htmlFor="confirm" className="label">Type DELETE to confirm</label>
                <input id="confirm" name="confirm" required autoComplete="off" className="field" /></div>
              <button className="btn border-bad-line bg-bad-fill text-bad-text">Delete my account</button>
            </form>
          </div>
        </details>
      </section>
    </div>
  );
}
