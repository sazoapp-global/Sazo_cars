// A dealer's "Business details" opens inside the dealer console frame (25 Oct 2026), beside the side bar.
// Other businesses keep the plain page (garages and inspectors work in the garage app).
import { AppFrame } from '@/components/app-frame/app-frame';
import { api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation } from '@/lib/types';

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await isSignedIn())) return <>{children}</>;
  const [orgs, me] = await Promise.all([
    api<MyOrganisation[]>('/me/organisations', { auth: true }).catch(() => [] as MyOrganisation[]),
    api<Me>('/me', { auth: true }).catch(() => undefined),
  ]);
  const org = orgs.find((o) => o.id === id);
  if (!org || org.type !== 'dealer' || org.status === 'rejected' || org.status === 'suspended') return <>{children}</>;
  const approved = org.status === 'approved';
  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name: org.tradingName ?? org.legalName, approved }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}>
      {children}
    </AppFrame>
  );
}
