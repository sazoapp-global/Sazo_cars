// One frame for every workspace (navigation plan, 25 Oct 2026): the site's top bar above, the side bar
// from the one navigation list on the left, and the page beside it. Pages give the workspace, the
// person's roles and (for a business workspace) the business; the list decides what they see.
import { navFor, WORKSPACES, type Viewer, type WorkspaceKey } from '@sazo/contracts';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { PhoneStrip, RAIL_COOKIE, Rail } from './rail';

export async function AppFrame({ workspace, viewer, org, business, person, badges, children }: {
  workspace: WorkspaceKey; viewer: Viewer; org?: string;
  business?: { name: string; approved: boolean }; person?: { name: string; role: string };
  badges?: Record<string, number>; children: React.ReactNode;
}) {
  const ws = WORKSPACES[workspace];
  const entries = navFor(workspace, viewer, org);
  const wide = (await cookies()).get(RAIL_COOKIE)?.value === 'wide';
  return (
    <div className="lg:flex">
      <Suspense>
        <Rail label={ws.label} entries={entries} business={business} person={person} badges={badges} initialWide={wide} />
        <PhoneStrip label={ws.label} entries={entries} business={business} />
      </Suspense>
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </div>
    </div>
  );
}
