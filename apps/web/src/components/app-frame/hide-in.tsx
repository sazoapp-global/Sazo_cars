'use client';
// Leaves something out of the page in the given workspaces (from the one navigation list), e.g. the site
// footer in the SAZO console.
import { workspaceOf, type WorkspaceKey } from '@sazo/contracts';
import { usePathname } from 'next/navigation';

export function HideIn({ workspaces, children }: { workspaces: WorkspaceKey[] | 'all'; children: React.ReactNode }) {
  const ws = workspaceOf(usePathname() ?? '');
  return ws && (workspaces === 'all' || workspaces.includes(ws.key)) ? null : <>{children}</>;
}

/** The opposite: only in the given workspaces (e.g. the online badge in the dealer console). */
export function ShowIn({ workspaces, children }: { workspaces: WorkspaceKey[]; children: React.ReactNode }) {
  const ws = workspaceOf(usePathname() ?? '');
  return ws && workspaces.includes(ws.key) ? <>{children}</> : null;
}
