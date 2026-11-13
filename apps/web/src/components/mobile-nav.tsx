'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/icon';
import { NAV_LINKS } from '@/components/main-nav';

/**
 * Phones: the main links behind a menu button (the desktop nav is hidden below md). While open, the page behind is
 * dimmed and does not scroll (13 Nov 2026); tapping the dimmed page, the ✕ or Escape closes it.
 */
export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const [shadeTop, setShadeTop] = useState(0);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    setShadeTop(top.current?.closest('header')?.getBoundingClientRect().bottom ?? 0);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={top} className="md:hidden">
      <button type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-lg text-ink hover:bg-soft">
        <Icon name={open ? 'close' : 'menu'} size={24} />
        <span className="sr-only">Menu</span>
      </button>
      {/* On the page itself: the header's blur would keep a fixed layer inside the header. */}
      {open && createPortal(<div aria-hidden data-menu-shade onClick={() => setOpen(false)} style={{ top: shadeTop }} className="fixed inset-x-0 bottom-0 z-30 bg-[rgba(11,21,48,0.5)] md:hidden" />, document.body)}
      {open && (
        <nav id="mobile-menu" aria-label="Main" className="absolute inset-x-0 top-full border-b border-line bg-white px-4 pb-4 pt-2 shadow-lg">
          <ul className="flex flex-col">
            {NAV_LINKS.map((l) => (
              <li key={l.label}>
                <Link href={l.href} onClick={() => setOpen(false)} aria-current={l.match(path) ? 'page' : undefined}
                  className={`flex min-h-12 items-center justify-between border-b border-line text-base font-semibold ${l.match(path) ? 'text-primary-container' : 'text-ink'}`}>
                  {l.label}<Icon name="chevron_right" size={20} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          {!signedIn && (
            <Link href="/#check" onClick={() => setOpen(false)} className="btn btn-focal mt-4 w-full">Check a Car<Icon name="arrow_forward" size={18} /></Link>
          )}
        </nav>
      )}
    </div>
  );
}
