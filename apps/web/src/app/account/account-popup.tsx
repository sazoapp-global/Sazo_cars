'use client';
// Your account in a popup from the header: who you are, how you sign in, your businesses, and links.
// Changing anything still happens on the settings page.
import { useState, useTransition } from 'react';
import { Facts, Popup } from '@/components/popup';
import { myAccount, type MyAccount } from './popup-actions';
import { signOut } from '../sign-in/actions';

const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff', partner_operator: 'Data entry' };
const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting for SAZO approval', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };

export function AccountPopup({ displayName, initials }: { displayName: string; initials: string }) {
  const [a, setA] = useState<MyAccount | null | undefined>();
  const [pending, start] = useTransition();
  const load = () => start(async () => setA(await myAccount()));
  return (
    <Popup title="Your account" onOpen={load} buttonLabel={`Settings for ${displayName}`}
      buttonClassName="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm font-semibold hover:bg-soft sm:pr-3"
      button={<><span className="avatar" aria-hidden>{initials}</span><span className="hidden max-w-[10rem] truncate sm:inline">{displayName}</span></>}>
      {pending || a === undefined ? <div className="skeleton h-40" /> : a === null ? <p>Could not load your account. Try again.</p> : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="avatar !size-12 text-lg" aria-hidden>{a.initials}</span>
            <div className="min-w-0"><p className="font-display text-lg font-bold">{a.name}</p><p className="text-sm text-muted">{a.progress.percent}% of your profile done</p></div>
          </div>
          <Facts rows={[
            ['Phone', a.phone ?? 'Not given'],
            ['Email', a.email ? `${a.email}${a.emailVerified ? '' : ' (not confirmed)'}` : 'Not given'],
            ['Password', a.hasPassword ? 'Set' : 'Not set'],
            ...(a.hasGoogle ? [['Google', 'Linked'] as [string, string]] : []),
          ]} />
          {a.businesses.length > 0 && (
            <section aria-label="Your businesses">
              <h3 className="text-sm font-bold">Your businesses</h3>
              <ul className="mt-1 divide-y divide-line text-sm">
                {a.businesses.map((b) => (
                  <li key={`${b.name}-${b.yourRole}`} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="font-semibold">{b.name}</span><span className="text-muted">{ROLE[b.yourRole] ?? b.yourRole} · {ORG_STATUS[b.status] ?? b.status}</span></li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap gap-2">
            <a href="/account" className="btn btn-primary">Open settings</a>
            <a href="/my-cars" className="btn btn-ghost">My cars</a>
            <a href="/saved" className="btn btn-ghost">Saved cars</a>
            <a href="/inspections" className="btn btn-ghost">Inspections</a>
          </div>
          <form action={signOut}><button className="text-sm font-semibold text-muted underline-offset-2 hover:underline">Sign out</button></form>
        </div>
      )}
    </Popup>
  );
}
