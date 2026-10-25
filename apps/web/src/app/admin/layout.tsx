import type { Metadata } from 'next';
import { AppFrame } from '@/components/app-frame/app-frame';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · SAZO admin' }, robots: { index: false, follow: false } };

/** The SAZO console: the shared frame with the console's modules for this person's role. Pages check access themselves. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await api<Me>('/me', { auth: true }).catch(() => undefined);
  const role = me?.platformRoles.includes('sazo_admin') ? 'SAZO admin' : me?.platformRoles.includes('sazo_reviewer') ? 'SAZO reviewer' : undefined;
  return (
    <AppFrame workspace="console" viewer={{ platformRoles: me?.platformRoles ?? [] }} person={me && role ? { name: me.displayName, role } : undefined}>
      {children}
    </AppFrame>
  );
}
