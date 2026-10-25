'use client';
// The top bar names the workspace you are in (from the one navigation list), next to the SAZO logo.
import { workspaceOf } from '@sazo/contracts';
import { usePathname } from 'next/navigation';

export function WorkspaceName() {
  const ws = workspaceOf(usePathname() ?? '');
  if (!ws) return null;
  return <span className="hidden whitespace-nowrap border-l border-line pl-3 text-sm font-semibold text-muted md:inline">{ws.label}</span>;
}
