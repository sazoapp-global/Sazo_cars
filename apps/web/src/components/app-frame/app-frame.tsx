// One frame for every workspace (navigation plan, 25 Oct 2026). On computers (option A, approved 25 Oct 2026)
// the side bar runs the full height of the screen with the SAZO logo at its top, and a slim bar over the page
// holds the testing note, online status, the bell and your name; the site's own top bars are hidden there
// (globals.css, [data-workspace-frame]). Phones keep the site's top bar and the strip of links.
// Pages give the workspace, the person's roles and (for a business workspace) the business.
import { navFor, WORKSPACES, type Viewer, type WorkspaceKey } from '@sazo/contracts';
import { Suspense } from 'react';
import { AccountPopup } from '@/app/account/account-popup';
import { Bell } from '@/components/notifications/bell';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { OnlineStatus } from './online-status';
import { PanelHost, PhoneStrip, Rail } from './rail';

export async function AppFrame({ workspace, viewer, org, business, person, badges, children }: {
  workspace: WorkspaceKey; viewer: Viewer; org?: string;
  business?: { name: string; approved: boolean }; person?: { name: string; role: string };
  badges?: Record<string, number>; children: React.ReactNode;
}) {
  const ws = WORKSPACES[workspace];
  const entries = navFor(workspace, viewer, org);
  const [unread, me] = await Promise.all([
    api<{ unread: number }>('/me/announcements', { auth: true }).then((r) => r.unread).catch(() => 0),
    api<Me>('/me', { auth: true }).catch(() => undefined),
  ]);
  const all = { ...badges, notifications: unread };
  return (
    <>
      <Suspense>
        <Rail label={ws.label} entries={entries} business={business} person={person} badges={all} />
        <PhoneStrip label={ws.label} entries={entries} business={business} badges={all} />
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
