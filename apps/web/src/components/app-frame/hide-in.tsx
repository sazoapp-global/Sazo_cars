'use client';
// Leaves something out of the page in the given workspaces (from the one navigation list), e.g. the site
// footer in the SAZO console.
import { workspaceOf, type WorkspaceKey } from '@sazo/contracts';
import { usePathname } from 'next/navigation';

export function HideIn({ workspaces, children }: { workspaces: WorkspaceKey[]; children: React.ReactNode }) {
  const ws = workspaceOf(usePathname() ?? '');
  return ws && workspaces.includes(ws.key) ? null : <>{children}</>;
}
