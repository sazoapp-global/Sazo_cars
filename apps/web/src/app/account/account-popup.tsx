'use client';
// Your details in a pop-up from your name in the top bar (25 Oct 2026): who you are, how you sign in and
// your businesses. Details only: Settings and Sign out live in the side bar or the My SAZO menu.
import { useState, useTransition } from 'react';
import { Facts, Popup } from '@/components/popup';
import { myAccount, type MyAccount } from './popup-actions';

const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff', partner_operator: 'Data entry' };
const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting for SAZO approval', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };

export function AccountPopup({ displayName, initials }: { displayName: string; initials: string }) {
  const [a, setA] = useState<MyAccount | null | undefined>();
  const [pending, start] = useTransition();
  const load = () => start(async () => setA(await myAccount()));
  return (
    <Popup title="Your details" onOpen={load} buttonLabel={`Your details, ${displayName}`}
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
            ['Email', a.email ? `${a.email}${a.emailVerified ? ' (confirmed)' : ' (not confirmed)'}` : 'Not given'],
            ['Password', a.hasPassword ? 'Set' : 'Not set'],
            ...(a.hasGoogle ? [['Google', 'Linked'] as [string, string]] : []),
            ['Businesses', a.businesses.length ? a.businesses.map((b) => `${b.name} (${ROLE[b.yourRole] ?? b.yourRole}, ${ORG_STATUS[b.status] ?? b.status})`).join('; ') : 'None'],
          ]} />
        </div>
      )}
    </Popup>
  );
}
