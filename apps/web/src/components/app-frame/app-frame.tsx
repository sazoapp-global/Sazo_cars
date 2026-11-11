// One frame for every workspace (navigation plan, 25 Oct 2026). On computers (option A, approved 25 Oct 2026)
// the side bar runs the full height of the screen with the SAZO logo at its top, and a slim bar over the page
// holds the testing note, online status, the bell and your name; the site's own top bars are hidden there
// (globals.css, [data-workspace-frame]). Phones keep the site's top bar and the strip of links.
// Pages give the workspace, the person's roles and (for a business workspace) the business.
import { navFor, WORKSPACES, type Viewer, type WorkspaceKey } from '@sazo/contracts';
import { Suspense } from 'react';
import { AccountPopup } from '@/app/account/account-popup';
import { Bell } from '@/components/notifications/bell';
import { alertsBadge } from '@/app/dealer/alerts';
import { api } from '@/lib/api';
import { unstable_rethrow } from 'next/navigation';
import type { Me } from '@/lib/types';
import { OnlineStatus } from './online-status';
import { PanelHost, PhoneStrip, Rail } from './rail';

export async function AppFrame({ workspace, viewer, org, business, person, badges, children }: {
  workspace: WorkspaceKey; viewer: Viewer; org?: string;
  business?: { name: string; approved: boolean; badge?: string }; person?: { name: string; role: string };
  badges?: Record<string, number>; children: React.ReactNode;
}) {
  const ws = WORKSPACES[workspace];
  const entries = navFor(workspace, viewer, org);
  const [unread, me, alerts, messages] = await Promise.all([
    api<{ unread: number }>('/me/announcements', { auth: true }).then((r) => r.unread).catch(() => 0),
    api<Me>('/me', { auth: true }).catch((e) => { unstable_rethrow(e); return undefined; }),
    // The dealer's Alerts count, red when anything needs acting on now, otherwise yellow (4 Nov 2026).
    workspace === 'dealer' && org ? alertsBadge(org, viewer.approved !== false).catch(() => undefined) : Promise.resolve(undefined),
    // Unread messages (D-173), counted for this person: the dealer's team conversations, or the broker's own.
    workspace === 'dealer' && org ? api<{ unread: number }>('/dealer/messages/unread', { auth: true, headers: { 'X-Organisation-Id': org } }).then((r) => r.unread).catch(() => 0)
      : workspace === 'broker' ? api<{ unread: number }>('/broker/messages/unread', { auth: true }).then((r) => r.unread).catch(() => 0) : Promise.resolve(0),
  ]);
  const all = { ...badges, notifications: unread, ...(alerts?.count ? { alerts: alerts.count } : {}), ...(messages ? { messages } : {}) };
  const tones: Record<string, 'red' | 'yellow' | 'lime'> = { ...(alerts?.tone ? { alerts: alerts.tone } : {}), messages: 'lime' };
  return (
    <>
      <Suspense>
        <Rail label={ws.label} entries={entries} business={business} person={person} badges={all} tones={tones} />
        <PhoneStrip label={ws.label} entries={entries} business={business} badges={all} tones={tones} />
      </Suspense>
      <div data-workspace-frame className="min-w-0 lg:pl-64">
        <div className="sticky top-0 z-30 hidden h-12 items-center gap-4 border-b border-line bg-card px-6 print:!hidden lg:flex">
          <p className="min-w-0 flex-1 truncate text-xs text-muted">Testing: records are simulated, not real cars.</p>
          <OnlineStatus />
          <Suspense><Bell unread={unread} /></Suspense>
          {me && <AccountPopup displayName={me.displayName} initials={me.initials} />}
        </div>
        {/* The whole space beside the side bar (28 Oct 2026): pages lay themselves out in columns, not a centred strip. */}
        <div className="w-full space-y-6 px-4 py-6 md:px-8 md:py-8">
          <Suspense>{/* the page; Notifications or Settings take its place without leaving it */}<PanelHost wide>{children}</PanelHost></Suspense>
        </div>
      </div>
    </>
  );
}
