'use client';
// "My SAZO" (approved 25 Oct 2026): on pages without a side bar, a signed-in person's own things in one
// dropdown in the top bar, then Settings (opens in the page) and Sign out. The items come from the
// navigation list; who sees which will be refined later.
import { MY_SAZO, SETTINGS_LINK, SETTINGS_PANEL } from '@sazo/contracts';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { signOut } from '@/app/sign-in/actions';
import { Icon, type IconName } from '@/components/icon';

export function MySazo() {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => { setOpen(false); }, [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [open]);
  const q = new URLSearchParams(search?.toString() ?? '');
  for (const k of ['done', 'error', 'newPhone']) q.delete(k);
  q.set('panel', SETTINGS_PANEL);
  const item = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] hover:bg-soft';
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border-2 border-primary-container px-2.5 py-1.5 text-sm font-bold text-primary-container hover:bg-soft">
        <Icon name="person" size={18} /><span className="hidden sm:inline">My SAZO</span><span className="sr-only sm:hidden">My SAZO</span>
        <Icon name="keyboard_arrow_down" size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={id} role="group" aria-label="My SAZO" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-[14px] border border-line bg-card p-2 shadow-xl">
          {MY_SAZO.map((l) => <Link key={l.key} href={l.href} className={item}><Icon name={l.icon as IconName} size={20} className="text-label" />{l.label}</Link>)}
          <div className="my-1.5 h-px bg-line" />
          <Link href={`${pathname}?${q}`} className={item}><Icon name={SETTINGS_LINK.icon as IconName} size={20} className="text-label" />{SETTINGS_LINK.label}</Link>
          <div className="my-1.5 h-px bg-line" />
          <form action={signOut} data-clear-drafts><button className={`${item} w-full text-left`}><Icon name="logout" size={20} className="text-label" />Sign out</button></form>
        </div>
      )}
    </div>
  );
}
