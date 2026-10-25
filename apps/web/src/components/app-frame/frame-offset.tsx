'use client';
// Moves something clear of the fixed side bar on pages that have one (e.g. the site footer on dealer pages).
import { workspaceOf } from '@sazo/contracts';
import { usePathname } from 'next/navigation';

export function FrameOffset({ children }: { children: React.ReactNode }) {
  return <div className={workspaceOf(usePathname() ?? '') ? 'lg:pl-64' : undefined}>{children}</div>;
}
