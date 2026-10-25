// "Send records" for SAZO staff opens inside the SAZO console frame (25 Oct 2026), beside the side bar.
// Data partners' own operators keep the plain page for now (their workspace comes in a later step).
import { AppFrame } from '@/components/app-frame/app-frame';
import { api, isSignedIn } from '@/lib/api';
import type { Me } from '@/lib/types';

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const me = (await isSignedIn()) ? await api<Me>('/me', { auth: true }).catch(() => undefined) : undefined;
  const staff = me?.platformRoles.includes('sazo_admin') ? 'SAZO admin' : me?.platformRoles.includes('sazo_reviewer') ? 'SAZO reviewer' : undefined;
  if (!me || !staff) return <>{children}</>;
  return <AppFrame workspace="console" viewer={{ platformRoles: me.platformRoles }} person={{ name: me.displayName, role: staff }}>{children}</AppFrame>;
}
