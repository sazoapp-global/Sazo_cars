'use client';
// The side bar (option C, 25 Oct 2026): a narrow navy bar of icons with a short word under each, widened by
// the button at its top or by tapping a group. Phones get the same links as a strip above the page.
// The links themselves come from the one navigation list (@sazo/contracts navigation.ts).
import { activeKey, isGroup, type NavEntry, type NavGroup, type NavLink } from '@sazo/contracts';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/icon';

export const RAIL_COOKIE = 'sazo_rail';

export interface RailProps {
  label: string;
  entries: NavEntry[];
  /** The business whose workspace this is, when there is one. */
  business?: { name: string; approved: boolean };
  person?: { name: string; role: string };
  badges?: Record<string, number>;
  initialWide: boolean;
}

const icon = (name: string) => name as IconName;

export function Rail({ label, entries, business, person, badges = {}, initialWide }: RailProps) {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const active = activeKey(entries, pathname, new URLSearchParams(search?.toString() ?? ''));
  const [wide, setWide] = useState(initialWide);
  const groupOf = (k?: string) => entries.find((e) => isGroup(e) && e.links.some((l) => l.key === k))?.key;
  const [open, setOpen] = useState<Set<string>>(() => new Set([groupOf(active)].filter(Boolean) as string[]));

  const remember = (w: boolean) => {
    setWide(w);
    try { document.cookie = `${RAIL_COOKIE}=${w ? 'wide' : 'narrow'}; Max-Age=31536000; Path=/; SameSite=Lax`; } catch { /* the choice is only a convenience */ }
  };
  const toggleGroup = (g: NavGroup) => {
    if (!wide) { remember(true); setOpen((s) => new Set(s).add(g.key)); return; }
    setOpen((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; });
  };

  const linkClass = (on: boolean) => `${on ? 'bg-primary-container font-bold text-white shadow-[inset_3px_0_0_#bff100]' : 'text-white/85 hover:bg-white/10'} rounded-lg`;
  const badge = (k: string) => (badges[k] !== undefined ? badges[k]!.toLocaleString('en-UG') : undefined);

  const narrowLink = (l: NavLink) => (
    <Link key={l.key} href={l.href} aria-label={l.label} title={l.label} aria-current={active === l.key ? 'page' : undefined}
      className={`flex w-20 flex-col items-center gap-1 px-1 py-2 text-center text-[11px] leading-tight ${linkClass(active === l.key)}`}>
      <Icon name={icon(l.icon)} size={22} className={active === l.key ? 'text-lime' : ''} />
      <span className="w-full truncate">{l.short}</span>
    </Link>
  );
  const wideLink = (l: NavLink, child = false) => (
    <Link key={l.key} href={l.href} aria-current={active === l.key ? 'page' : undefined}
      className={`flex items-center gap-3 px-3 py-2 text-[15px] ${child ? 'ml-4' : ''} ${linkClass(active === l.key)}`}>
      <Icon name={icon(l.icon)} size={20} className={active === l.key ? 'text-lime' : 'text-white/75'} />
      <span className="flex-1">{l.label}</span>
      {badge(l.key) && <span className="text-sm text-white/70">{badge(l.key)}</span>}
    </Link>
  );

  return (
    <aside aria-label={`${label} menu`}
      className={`sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col overflow-y-auto overscroll-contain border-r-4 border-lime bg-primary text-white print:!hidden md:top-20 md:h-[calc(100dvh-5rem)] lg:flex ${wide ? 'w-64' : 'w-24'}`}>
      <div className={`flex items-center border-b border-white/15 ${wide ? 'justify-between px-4 py-3' : 'justify-center py-3'}`}>
        {wide && (
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{label}</p>
            {business && <p className="truncate font-display font-bold leading-snug">{business.name}</p>}
            {business?.approved && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink"><Icon name="verified_user" size={12} />Approved by SAZO</span>}
          </div>
        )}
        <button type="button" onClick={() => remember(!wide)} aria-expanded={wide} aria-label={wide ? 'Narrow the menu' : 'Widen the menu'}
          className="grid size-10 shrink-0 place-items-center rounded-lg text-white/85 hover:bg-white/10">
          <Icon name={wide ? 'arrow_back' : 'menu'} size={22} />
        </button>
      </div>
      <nav aria-label={label} className={`flex flex-1 flex-col gap-1 py-3 ${wide ? 'px-3' : 'items-center px-2'}`}>
        {entries.map((e) => {
          if (!isGroup(e)) return wide ? wideLink(e) : narrowLink(e);
          const holdsActive = e.links.some((l) => l.key === active);
          if (!wide) {
            return (
              <button key={e.key} type="button" onClick={() => toggleGroup(e)} title={e.label} aria-label={`${e.label}: show its pages`}
                className={`flex w-20 flex-col items-center gap-1 px-1 py-2 text-[11px] leading-tight ${linkClass(holdsActive)}`}>
                <Icon name={icon(e.icon)} size={22} className={holdsActive ? 'text-lime' : ''} />
                <span className="w-full truncate">{e.short}</span>
              </button>
            );
          }
          const isOpen = open.has(e.key);
          return (
            <div key={e.key}>
              <button type="button" onClick={() => toggleGroup(e)} aria-expanded={isOpen}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] font-semibold ${holdsActive && !isOpen ? 'text-lime' : 'text-white'} hover:bg-white/10`}>
                <Icon name={icon(e.icon)} size={20} className="text-white/75" />
                <span className="flex-1">{e.label}</span>
                <Icon name="keyboard_arrow_down" size={18} className={`text-white/70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <div className="mt-1 space-y-1">{e.links.map((l) => wideLink(l, true))}</div>}
            </div>
          );
        })}
      </nav>
      {wide && person && (
        <div className="border-t border-white/15 px-5 py-4 text-sm">
          <p className="font-semibold">{person.name}</p>
          <p className="text-white/70">{person.role}</p>
        </div>
      )}
    </aside>
  );
}

/** Phones and small tablets: the same links as one scrolling strip, the current one in view. */
export function PhoneStrip({ label, entries, business }: Pick<RailProps, 'label' | 'entries' | 'business'>) {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const active = activeKey(entries, pathname, new URLSearchParams(search?.toString() ?? ''));
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [active]);
  const links = entries.flatMap((e) => (isGroup(e) ? e.links : [e]));
  return (
    <div className="border-b-4 border-lime bg-primary text-white print:hidden lg:hidden">
      <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-white/70">{label}{business ? ` · ${business.name}` : ''}</p>
      <nav aria-label={label} className="flex gap-1 overflow-x-auto px-2 pb-2 pt-1">
        {links.map((l) => (
          <Link key={l.key} href={l.href} ref={active === l.key ? current : undefined} aria-current={active === l.key ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${active === l.key ? 'bg-primary-container font-bold shadow-[inset_0_-3px_0_#bff100]' : 'text-white/85'}`}>
            <Icon name={icon(l.icon)} size={18} />{l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
