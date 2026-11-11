'use client';
// Leaves something out of the page in the given workspaces (from the one navigation list), e.g. the site
// footer in the SAZO console.
import { workspaceOf, type WorkspaceKey } from '@sazo/contracts';
import { usePathname } from 'next/navigation';

// The timed "done" note (10 Nov 2026) and the popup that asks before removing (11 Nov 2026), passed on from here: Settings is drawn by a server action inside any page,
// and a client part it uses must be one the page already loads. The root layout loads this file on every page.
export { Flash } from '@/components/flash';
export { ConfirmButton } from '@/components/confirm-button';

export function HideIn({ workspaces, children }: { workspaces: WorkspaceKey[] | 'all'; children: React.ReactNode }) {
  const ws = workspaceOf(usePathname() ?? '');
  return ws && (workspaces === 'all' || workspaces.includes(ws.key)) ? null : <>{children}</>;
}

/** The opposite: only in the given workspaces (e.g. the online badge in the dealer console). */
export function ShowIn({ workspaces, children }: { workspaces: WorkspaceKey[]; children: React.ReactNode }) {
  const ws = workspaceOf(usePathname() ?? '');
  return ws && workspaces.includes(ws.key) ? <>{children}</> : null;
}

/**
 * The site footer is for the public website only: not in the consoles, and not on a business's own pages
 * (a garage's or dealer's /business/<id> pages, 25 Oct 2026). Registering a business keeps it.
 */
export function FooterGate({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '';
  const ws = workspaceOf(path);
  const businessPage = /^\/business\/(?!register(\/|$))[^/]+/.test(path);
  return (ws && (ws.key === 'console' || ws.key === 'dealer')) || businessPage ? null : <>{children}</>;
}
