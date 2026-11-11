import type { Metadata } from 'next';
import { AppFrame } from '@/components/app-frame/app-frame';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Me } from '@/lib/types';
import NoAccess from './no-access/page';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · SAZO admin' }, robots: { index: false, follow: false } };

/**
 * The SAZO console: the shared frame with the console's modules for this person's role. Only SAZO staff get in
 * (D-172): the check is made here, before anything is drawn, as well as on each page and again by the API.
 * Others are sent to log in, or shown "SAZO staff only" with the way to their own page.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get('x-sazo-path') ?? '/admin';
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const me = await api<Me>('/me', { auth: true }).catch((err) => {
    if (err instanceof ApiError && err.status === 401) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
    throw err;
  });
  const isAdmin = me.platformRoles.includes('sazo_admin');
  // Not SAZO staff: the console's pages are never drawn, whatever the address; the layout says so instead.
  // (A redirect from a layout is not redrawn by the next page under it, so the message is shown in place.)
  if (!isAdmin && !me.platformRoles.includes('sazo_reviewer')) return <NoAccess />;
  const role = isAdmin ? 'SAZO admin' : 'SAZO reviewer';
  return (
    <AppFrame workspace="console" viewer={{ platformRoles: me.platformRoles }} person={{ name: me.displayName, role }}>
      {children}
    </AppFrame>
  );
}
