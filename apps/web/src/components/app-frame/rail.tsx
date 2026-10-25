'use client';
// The side bar (approved 25 Oct 2026): navy, always full width, fixed in place under the top bar so scrolling
// the page never moves it. Groups open as dropdowns; Notifications opens inside the page. Phones get the same
// links as a strip above the page. The links come from the one navigation list (@sazo/contracts).
import { NOTIFICATIONS_PANEL, SETTINGS_LINK, SETTINGS_PANEL, activeKey, isGroup, type NavEntry, type NavGroup, type NavLink } from '@sazo/contracts';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { signOut } from '@/app/sign-in/actions';
import { loadSettings } from '@/app/account/settings-actions';
import { Icon, type IconName } from '@/components/icon';
import { NotificationsView } from '@/components/notifications/notifications-view';
import { ThemeChoice } from '@/components/theme/theme-choice';

export interface RailProps {
  label: string;
  entries: NavEntry[];
  /** The business whose workspace this is, when there is one. */
  business?: { name: string; approved: boolean };
  person?: { name: string; role: string };
  badges?: Record<string, number>;
}

const icon = (name: string) => name as IconName;

/** A link's real address: "?panel=…" links keep the page you are on. */
function useHref() {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  return (l: NavLink) => {
    if (!l.href.startsWith('?')) return l.href;
    const q = new URLSearchParams(search?.toString() ?? '');
    for (const [k, v] of new URLSearchParams(l.href.slice(1))) q.set(k, v);
    return `${pathname}?${q}`;
  };
}

function useActive(entries: NavEntry[]) {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  return activeKey([...entries, SETTINGS_LINK], pathname, new URLSearchParams(search?.toString() ?? ''));
}

export function Rail({ label, entries, business, person, badges = {} }: RailProps) {
  const active = useActive(entries);
  const href = useHref();
  const groupOf = (k?: string) => entries.find((e) => isGroup(e) && e.links.some((l) => l.key === k))?.key;
  const [open, setOpen] = useState<Set<string>>(() => new Set([groupOf(active)].filter(Boolean) as string[]));
  const toggle = (g: NavGroup) => setOpen((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; });

  const badge = (k: string) => {
    const n = badges[k];
    if (!n) return null;
    return k === 'notifications'
      ? <span className="rounded-full bg-bad-text px-2 text-xs font-extrabold leading-5 text-white" aria-label={`${n} new`}>{n > 99 ? '99+' : n}</span>
      : <span className="text-sm text-white/70">{n.toLocaleString('en-UG')}</span>;
  };
  const link = (l: NavLink, child = false) => {
    const on = active === l.key;
    return (
      <Link key={l.key} href={href(l)} aria-current={on ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] ${child ? 'ml-5' : ''} ${on ? 'bg-primary-container font-bold text-white shadow-[inset_3px_0_0_#bff100]' : 'text-white/85 hover:bg-white/10'}`}>
        <Icon name={icon(l.icon)} size={20} className={on ? 'text-lime' : 'text-white/75'} />
        <span className="flex-1">{l.label}</span>
        {badge(l.key)}
      </Link>
    );
  };

  return (
    <aside aria-label={`${label} menu`} style={{ top: 'var(--site-top, 113px)' }}
      className="fixed bottom-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto overscroll-contain border-r-4 border-lime bg-primary text-white print:!hidden lg:flex">
      <div className="border-b border-white/15 px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{label}</p>
        {business ? (
          <>
            <p className="truncate font-display text-lg font-bold leading-snug">{business.name}</p>
            {business.approved && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink"><Icon name="verified_user" size={12} />Approved by SAZO</span>}
          </>
        ) : person && (
          <>
            <p className="truncate font-display text-lg font-bold leading-snug">{person.name}</p>
            <p className="text-sm text-white/70">{person.role}</p>
          </>
        )}
      </div>
      <nav aria-label={label} className="flex flex-1 flex-col gap-1 p-3">
        {entries.map((e) => {
          if (!isGroup(e)) return link(e);
          const isOpen = open.has(e.key);
          const holdsActive = e.links.some((l) => l.key === active);
          return (
            <div key={e.key}>
              <button type="button" onClick={() => toggle(e)} aria-expanded={isOpen}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] font-semibold hover:bg-white/10 ${holdsActive && !isOpen ? 'text-lime' : 'text-white'}`}>
                <Icon name={icon(e.icon)} size={20} className="text-white/75" />
                <span className="flex-1">{e.label}</span>
                <Icon name="keyboard_arrow_down" size={18} className={`text-white/70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <div className="mt-1 space-y-1">{e.links.map((l) => link(l, true))}</div>}
            </div>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-white/15 p-3">
        {link(SETTINGS_LINK)}
        <form action={signOut}>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] text-white/85 hover:bg-white/10"><Icon name="logout" size={20} className="text-white/75" />Sign out</button>
        </form>
        {business && person && <p className="px-3 pt-2 text-sm text-white/70">{person.name} · {person.role}</p>}
      </div>
    </aside>
  );
}

/** Phones and small tablets: the same links as one scrolling strip, the current one in view. */
export function PhoneStrip({ label, entries, business, badges = {} }: Pick<RailProps, 'label' | 'entries' | 'business' | 'badges'>) {
  const active = useActive(entries);
  const href = useHref();
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [active]);
  const links = [...entries.flatMap((e) => (isGroup(e) ? e.links : [e])), SETTINGS_LINK];
  return (
    <div className="border-b-4 border-lime bg-primary text-white print:hidden lg:hidden">
      <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-white/70">{label}{business ? ` · ${business.name}` : ''}</p>
      <nav aria-label={label} className="flex gap-1 overflow-x-auto px-2 pb-2 pt-1">
        {links.map((l) => (
          <Link key={l.key} href={href(l)} ref={active === l.key ? current : undefined} aria-current={active === l.key ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${active === l.key ? 'bg-primary-container font-bold shadow-[inset_0_-3px_0_#bff100]' : 'text-white/85'}`}>
            <Icon name={icon(l.icon)} size={18} />{l.label}
            {l.key === 'notifications' && !!badges.notifications && <span className="rounded-full bg-bad-text px-1.5 text-xs font-bold text-white">{badges.notifications}</span>}
          </Link>
        ))}
        <form action={signOut} className="shrink-0">
          <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/85"><Icon name="logout" size={18} />Sign out</button>
        </form>
      </nav>
    </div>
  );
}

/**
 * The page, or a panel in its place: Notifications (?panel=notifications) or Settings (?panel=settings).
 * The page stays loaded underneath and comes back on Close. `enabled` lets the site-wide host stand aside
 * on pages whose workspace frame has its own.
 */
export function PanelHost({ children, enabled = true, wide = false }: { children: ReactNode; enabled?: boolean; wide?: boolean }) {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const which = enabled ? search?.get('panel') : null;
  const panel = which === NOTIFICATIONS_PANEL || which === SETTINGS_PANEL ? which : null;
  const q = new URLSearchParams(search?.toString() ?? '');
  for (const k of ['panel', 'done', 'error', 'newPhone']) q.delete(k);
  const closeHref = q.toString() ? `${pathname}?${q}` : pathname;
  const box = wide ? '' : 'mx-auto max-w-3xl px-4 py-8 md:px-8';
  return (
    <>
      {panel && (
        <section aria-labelledby="panel-heading" className={`space-y-4 ${box}`}>
          <div className="flex items-center justify-between gap-3">
            <h1 id="panel-heading" className="font-display text-2xl font-bold md:text-3xl">{panel === SETTINGS_PANEL ? 'Settings' : 'Notifications'}</h1>
            <Link href={closeHref} className="inline-flex items-center gap-1.5 font-semibold text-primary-container hover:underline"><Icon name="close" size={20} />Close</Link>
          </div>
          {panel === SETTINGS_PANEL ? <SettingsPanel closeHref={closeHref} /> : <NotificationsView />}
        </section>
      )}
      <div hidden={!!panel} className={wide ? 'space-y-6' : undefined}>{children}</div>
    </>
  );
}

/** Settings drawn by the server for this page; changes come back here with their outcome. */
function SettingsPanel({ closeHref }: { closeHref: string }) {
  const search = useSearchParams();
  const [view, setView] = useState<ReactNode>(null);
  const key = search?.toString() ?? '';
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams(closeHref.split('?')[1] ?? '');
    q.set('panel', SETTINGS_PANEL);
    const back = `${closeHref.split('?')[0]}?${q}`;
    void loadSettings({ back, done: search?.get('done') ?? undefined, error: search?.get('error') ?? undefined, newPhone: search?.get('newPhone') ?? undefined })
      .then((v) => { if (live) setView(v); });
    return () => { live = false; };
  }, [key, closeHref, search]);
  // The appearance choice runs on the device, so it goes into the slot the server left for it.
  const box = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => { setSlot(box.current?.querySelector('[data-slot="appearance"]') ?? null); }, [view]);
  if (!view) return <div className="skeleton h-64" />;
  return <div ref={box}>{view}{slot && createPortal(<ThemeChoice />, slot)}</div>;
}
