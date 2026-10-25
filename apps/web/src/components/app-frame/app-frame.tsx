// One frame for every workspace (navigation plan, 25 Oct 2026): the site's top bar above, the fixed side bar
// from the one navigation list on the left, and the page beside it. Notifications open inside the page.
// Pages give the workspace, the person's roles and (for a business workspace) the business.
import { navFor, WORKSPACES, type Viewer, type WorkspaceKey } from '@sazo/contracts';
import { Suspense } from 'react';
import { api } from '@/lib/api';
import { PanelHost, PhoneStrip, Rail } from './rail';

export async function AppFrame({ workspace, viewer, org, business, person, badges, children }: {
  workspace: WorkspaceKey; viewer: Viewer; org?: string;
  business?: { name: string; approved: boolean }; person?: { name: string; role: string };
  badges?: Record<string, number>; children: React.ReactNode;
}) {
  const ws = WORKSPACES[workspace];
  const entries = navFor(workspace, viewer, org);
  const unread = await api<{ unread: number }>('/me/announcements', { auth: true }).then((r) => r.unread).catch(() => 0);
  const all = { ...badges, notifications: unread };
  return (
    <>
      <Suspense>
        <Rail label={ws.label} entries={entries} business={business} person={person} badges={all} />
        <PhoneStrip label={ws.label} entries={entries} business={business} badges={all} />
      </Suspense>
      <div className="min-w-0 lg:pl-64">
        <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-8 md:py-8">
          <Suspense>{/* the page; Notifications or Settings take its place without leaving it */}<PanelHost wide>{children}</PanelHost></Suspense>
        </div>
      </div>
    </>
  );
}
