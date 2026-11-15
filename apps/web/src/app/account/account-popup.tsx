'use client';
// Your details in a pop-up from your name in the top bar (25 Oct 2026): who you are, how you sign in and
// your businesses, then Sign out (27 Oct 2026). Settings live in the side bar or the My SAZO menu.
import { useState, useTransition } from 'react';
import { signOut } from '@/app/sign-in/actions';
import { Icon } from '@/components/icon';
import { pictureUrl } from '@/components/avatar';
import { Facts, Popup } from '@/components/popup';
import { myAccount, type MyAccount } from './popup-actions';

const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff', partner_operator: 'Data entry' };
const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting for SAZO approval', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };

export function AccountPopup({ displayName, initials, photoId }: { displayName: string; initials: string; photoId?: string | null }) {
  // Your photo (D-186) in place of your initials, when you have one.
  const circle = (big = false) => photoId
    ? <img src={pictureUrl(photoId)} alt="" aria-hidden className={`avatar object-cover !p-0 ${big ? '!size-12' : ''}`} />
    : <span className={`avatar ${big ? '!size-12 text-lg' : ''}`} aria-hidden>{initials}</span>;
  const [a, setA] = useState<MyAccount | null | undefined>();
  const [pending, start] = useTransition();
  const load = () => start(async () => setA(await myAccount()));
  return (
    <Popup title="Your details" onOpen={load} buttonLabel={`Your details, ${displayName}`}
      buttonClassName="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm font-semibold hover:bg-soft sm:pr-3"
      button={<>{circle()}<span className="hidden max-w-[10rem] truncate sm:inline">{displayName}</span></>}>
      {pending || a === undefined ? <div className="skeleton h-40" /> : a === null ? <p>Could not load your account. Try again.</p> : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {circle(true)}
            <div className="min-w-0"><p className="font-display text-lg font-bold">{a.name}</p><p className="text-sm text-muted">{a.progress.percent}% of your profile done</p></div>
          </div>
          <Facts rows={[
            ['Phone', a.phone ?? 'Not given'],
            ['Email', a.email ? `${a.email}${a.emailVerified ? ' (confirmed)' : ' (not confirmed)'}` : 'Not given'],
            ['Password', a.hasPassword ? 'Set' : 'Not set'],
            ...(a.hasGoogle ? [['Google', 'Linked'] as [string, string]] : []),
            ['Businesses', a.businesses.length ? a.businesses.map((b) => `${b.name} (${ROLE[b.yourRole] ?? b.yourRole}, ${ORG_STATUS[b.status] ?? b.status})`).join('; ') : 'None'],
          ]} />
          <form action={signOut} data-clear-drafts className="border-t border-line pt-4">
            <button className="btn btn-ghost w-full justify-center text-bad-text"><Icon name="logout" />Sign out</button>
          </form>
        </div>
      )}
    </Popup>
  );
}
