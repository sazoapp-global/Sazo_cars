'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV_LINKS = [
  { href: '/', label: 'Check a Car', match: (p: string) => p === '/' || p.startsWith('/check') || p.startsWith('/v/') },
  { href: '/compare', label: 'Compare Cars', match: (p: string) => p.startsWith('/compare') },
  { href: '/business', label: 'For Businesses', match: (p: string) => p.startsWith('/business') },
];

/** The design's top navigation: the current section is underlined. */
export function MainNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
      {NAV_LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link key={l.label} href={l.href} aria-current={active ? 'page' : undefined}
            className={`relative py-1 text-sm font-semibold transition-colors after:absolute after:bottom-0 after:left-0 after:h-[2px] after:bg-primary-container after:transition-all ${active ? 'text-primary-container after:w-full' : 'text-muted after:w-0 hover:text-ink hover:after:w-full'}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
