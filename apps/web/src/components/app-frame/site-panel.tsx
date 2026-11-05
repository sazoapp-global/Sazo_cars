'use client';
// Pages without a side bar: Settings (and Notifications, by link) open in place of the page, like in a workspace.
import { inSideBarFrame } from './framed';
import { usePathname } from 'next/navigation';
import { PanelHost } from './rail';

export function SitePanel({ children }: { children: React.ReactNode }) {
  return <PanelHost enabled={!inSideBarFrame(usePathname() ?? '')}>{children}</PanelHost>;
}
