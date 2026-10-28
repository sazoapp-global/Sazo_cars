// The garage app's frame, the same as the website's workspaces (approved 25 Oct 2026, D-137 and D-138):
// - a top bar: the app, the business, online or not, the notification bell and your name (your name shows
//   your details only). On computers (option A, 25 Oct 2026) it is a slim bar over the page only;
// - on tablets and computers a navy side bar running the full height of the screen, with the app at its top,
//   the modules from the one navigation list (@sazo/contracts), and Settings and Sign out at its foot;
// - on phones the bottom tabs, with Settings and Sign out under More;
// - Notifications and Settings open inside the page you are on, and Close brings it back.
import { NOTIFICATIONS_PANEL, SETTINGS_PANEL, activeKey, isGroup, navFor, type NavLink } from '@sazo/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import { closePanel, go, openPanel, pagePath, usePanel, type Route } from '../lib/route';
import { isInspector, type Garage, type Me } from '../lib/types';
import { rememberAppKind } from '../lib/app-kind';
import { Icon, type IconName } from './icon';
import { ThemePicker } from './theme-picker';

export const WEBSITE = import.meta.env.VITE_SAZO_WEB_URL ?? 'http://localhost:3001';
const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff' };

interface Notice { id: string; audience?: string; title: string; body: string; createdAt: string; read: boolean }

/** Unread messages from SAZO, for the bell and the side bar (refreshed when a panel closes or one is read). */
function useUnread(online: boolean, panel: string | undefined) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!online) return;
    let live = true;
    const load = () => { request<{ unread: number }>('/me/announcements').then((r) => { if (live) setUnread(r.unread); }).catch(() => undefined); };
    load();
    window.addEventListener('sazo-notifications-read', load); // opening one lowers the count at once
    return () => { live = false; window.removeEventListener('sazo-notifications-read', load); };
  }, [online, panel]);
  return unread;
}

/** Click a link from the navigation list: a "#/…" page, or a panel inside this page. */
function follow(l: NavLink) {
  if (l.href === `?panel=${NOTIFICATIONS_PANEL}`) openPanel('notifications');
  else if (l.href === `?panel=${SETTINGS_PANEL}`) openPanel('settings');
  else location.hash = l.href;
}

const SETTINGS: NavLink = { key: 'settings', label: 'Settings', short: 'Settings', icon: 'edit', href: `?panel=${SETTINGS_PANEL}` };

export function Shell({ garage, me, route, online, unsent, records, needsAction, onSignOut, onSwitch, children }: {
  garage: Garage; me: Me; route: Route; online: boolean; unsent: number; records?: number; needsAction: number; onSignOut: () => void; onSwitch?: () => void; children: React.ReactNode;
}) {
  const inspector = isInspector(garage);
  const app = inspector ? 'SAZO Inspect' : 'SAZO Garage';
  useEffect(() => { rememberAppKind(inspector ? 'inspect' : 'garage'); }, [inspector]);
  const panel = usePanel();
  const unread = useUnread(online, panel);
  const entries = navFor(inspector ? 'inspect' : 'garage', { platformRoles: [], orgRole: garage.role }).flatMap((e) => (isGroup(e) ? e.links : [e]));
  const active = activeKey([...entries, SETTINGS], pagePath(), new URLSearchParams(location.hash.split('?')[1] ?? ''));
  const badges: Record<string, number | undefined> = { notifications: unread, alerts: needsAction };
  const counts: Record<string, number | undefined> = { records };
  const inWizard = route.name === 'job' || route.name === 'inspection';
  const role = ROLE[garage.role] ?? 'Staff';

  const tabs = inspector ? ['home', 'concerns', 'more'] : ['home', 'records', 'alerts', 'more'];
  const tab = (key: string) => (key === 'more'
    ? { key, label: 'More', icon: 'more_horiz' as IconName, on: route.name === 'more' || route.name === 'staff' || !!panel, go: () => go({ name: 'more' }) }
    : (() => { const l = entries.find((e) => e.key === key)!; return { key, label: l.short, icon: l.icon as IconName, on: !panel && active === key, go: () => follow(l) }; })());

  return (
    <div className="min-h-dvh bg-surface print:bg-white">
      <TopBar app={app} garage={garage} me={me} online={online} unread={unread} onSignOut={onSignOut} />
      {!online && (
        <div className="bg-ink px-4 py-2.5 text-sm text-white print:hidden lg:pl-[17rem]">
          <p className="font-bold">You’re offline</p>
          <p className="text-white/85">{unsent ? `${unsent} ${unsent === 1 ? 'job is' : 'jobs are'} saved on this phone. They’ll upload automatically when there’s signal.` : 'Keep working. Everything is saved on this phone and uploads when there’s signal.'}</p>
        </div>
      )}

      {/* side bar: tablets and computers, fixed under the top bar */}
      <aside aria-label={`${app} menu`} className="fixed bottom-0 left-0 top-0 z-40 hidden w-64 flex-col overflow-y-auto overscroll-contain border-r-4 border-lime bg-primary text-white print:!hidden lg:flex">
        <button type="button" onClick={() => go({ name: 'home' })} className="flex h-12 shrink-0 items-center gap-2.5 border-b border-white/15 px-5 text-left">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-lime text-primary"><Icon name={inspector ? 'fact_check' : 'garage'} size={18} /></span>
          <span className="font-display text-lg font-extrabold">{app}</span>
        </button>
        <div className="shrink-0 border-b border-white/15 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">{app}</p>
          <p className="truncate font-display text-lg font-bold leading-snug">{garage.name}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink"><Icon name="verified_user" size={12} />Approved by SAZO</span>
        </div>
        <nav aria-label={app} className="flex flex-1 flex-col gap-1 p-3">
          {entries.map((l) => <RailLink key={l.key} l={l} on={active === l.key} badge={badges[l.key]} count={counts[l.key]} />)}
        </nav>
        <div className="shrink-0 space-y-1 border-t border-white/15 p-3">
          <RailLink l={SETTINGS} on={active === 'settings'} />
          <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] text-white/85 hover:bg-white/10">
            <Icon name="logout" size={20} className="text-white/75" />Sign out
          </button>
          <p className="px-3 pt-2 text-sm text-white/70">{me.displayName} · {role}</p>
        </div>
      </aside>

      <main className={`min-w-0 lg:pl-64 ${inWizard ? '' : 'pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0'}`}>
        {panel ? (
          <section aria-labelledby="panel-heading" className="mx-auto w-full max-w-xl space-y-4 p-4 lg:max-w-3xl lg:p-8">
            <div className="flex items-center justify-between gap-3">
              <h1 id="panel-heading" className="font-display text-2xl font-bold">{panel === 'settings' ? 'Settings' : 'Notifications'}</h1>
              <button type="button" onClick={closePanel} className="inline-flex items-center gap-1.5 font-semibold text-primary-container hover:underline"><Icon name="close" size={20} />Close</button>
            </div>
            {panel === 'settings' ? <SettingsView garage={garage} me={me} onSignOut={onSignOut} onSwitch={onSwitch} /> : <NotificationsView online={online} />}
          </section>
        ) : children}
      </main>

      {/* bottom tabs: phones */}
      {!inWizard && (
        <nav aria-label={`${app} tabs`} className="fixed inset-x-0 bottom-0 z-20 grid border-t-2 border-ink bg-white pb-[env(safe-area-inset-bottom)] print:!hidden lg:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map(tab).map((t) => (
            <button key={t.key} type="button" onClick={t.go} aria-current={t.on ? 'page' : undefined}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${t.on ? '-mt-0.5 border-t-4 border-primary-container text-primary-container' : 'text-muted'}`}>
              <Icon name={t.icon} size={22} />{t.label}
              {!!badges[t.key] && <span className="absolute right-[calc(50%-22px)] top-2 min-w-5 rounded-full bg-bad-text px-1 text-[11px] font-bold leading-5 text-white" aria-label={`${badges[t.key]} need attention`}>{badges[t.key]}</span>}
              {t.key === 'more' && unread > 0 && <span className="absolute right-[calc(50%-18px)] top-2 size-2.5 rounded-full bg-bad-text" aria-label={`${unread} new messages`} />}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function RailLink({ l, on, badge, count }: { l: NavLink; on: boolean; badge?: number; count?: number }) {
  return (
    <button type="button" onClick={() => follow(l)} aria-current={on ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] ${on ? 'bg-primary-container font-bold text-white shadow-[inset_3px_0_0_#bff100]' : 'text-white/85 hover:bg-white/10'}`}>
      <Icon name={l.icon as IconName} size={20} className={on ? 'text-lime' : 'text-white/75'} />
      <span className="flex-1">{l.label}</span>
      {count !== undefined && <span className="text-sm text-white/70">{count.toLocaleString('en-UG')}</span>}
      {!!badge && <span className="rounded-full bg-bad-text px-2 text-xs font-extrabold leading-5 text-white" aria-label={`${badge} new`}>{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}

/** The top bar: the app and business, online or not, the bell, and your name (details only). */
function TopBar({ app, garage, me, online, unread, onSignOut }: { app: string; garage: Garage; me: Me; online: boolean; unread: number; onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-card px-4 print:hidden lg:ml-64 lg:h-12 lg:px-6">
      <p className="hidden min-w-0 flex-1 truncate text-xs text-muted lg:block">Testing: records are simulated, not real cars.</p>
      <button type="button" onClick={() => go({ name: 'home' })} className="flex min-w-0 items-center gap-2 text-left lg:hidden">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-lime"><Icon name={isInspector(garage) ? 'fact_check' : 'garage'} size={20} /></span>
        <span className="min-w-0">
          <span className="block font-display text-base font-extrabold leading-tight text-primary">{app}</span>
          <span className="line-clamp-2 block break-words text-xs leading-tight text-muted lg:hidden">{garage.name}</span>
        </span>
      </button>
      <span role="status" aria-live="polite" className={`chip ml-auto shrink-0 lg:ml-0 !border-0 ${online ? 'bg-soft text-ok-text' : 'bg-lime text-ink'}`}>
        {/* On a phone the word is left to screen readers when online, so the business name has room (27 Oct 2026). */}
        <Icon name={online ? 'cloud_done' : 'wifi_off'} size={14} /><span className={online ? 'sr-only sm:not-sr-only' : ''}>{online ? 'Online' : 'Offline'}</span>
      </span>
      <button type="button" onClick={() => openPanel('notifications')} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        className="relative grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-soft">
        <Icon name="notifications" size={24} />
        {unread > 0 && <span aria-hidden className="absolute right-1 top-1 min-w-5 rounded-full bg-bad-text px-1 text-center text-[11px] font-bold leading-5 text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      <Details garage={garage} me={me} online={online} onSignOut={onSignOut} />
    </header>
  );
}

interface Profile { phone: string | null; email: string | null; surname: string | null; firstName: string | null; middleName: string | null }

/** Your name in the top bar: your details in a pop-up and Sign out; nothing to change here (that is Settings). */
function Details({ garage, me, online, onSignOut }: { garage: Garage; me: Me; online: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>();
  const dialog = useRef<HTMLDivElement>(null);
  const initials = me.initials ?? me.displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const show = useCallback(() => {
    setOpen(true);
    if (online && profile === undefined) request<Profile>('/me/profile').then(setProfile).catch(() => setProfile(null));
  }, [online, profile]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  const name = profile ? [profile.surname, profile.firstName, profile.middleName].filter(Boolean).join(' ') || me.displayName : me.displayName;
  const rows: [string, string][] = [
    ['Phone', profile?.phone ?? (profile === undefined && online ? '…' : 'Not added')],
    ['Email', profile?.email ?? (profile === undefined && online ? '…' : 'Not added')],
    ['Business', garage.name],
    ['Your role', ROLE[garage.role] ?? 'Staff'],
  ];
  return (
    <>
      <button type="button" onClick={show} aria-haspopup="dialog" aria-label={`Your details, ${me.displayName}`}
        className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-soft md:pr-3">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary-container text-sm font-bold text-white">{initials}</span>
        <span className="hidden max-w-40 truncate font-semibold md:block">{me.displayName}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="details-title" className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl outline-none">
            <div className="flex items-start justify-between gap-3">
              <h2 id="details-title" className="font-display text-xl font-bold">Your details</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-soft"><Icon name="close" size={20} /></button>
            </div>
            <p className="mt-1 font-semibold">{name}</p>
            <dl className="mt-3 divide-y divide-line text-sm">
              {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
            </dl>
            <div className="mt-3 border-t border-line pt-4">
              <button type="button" onClick={onSignOut} className="btn btn-ghost w-full justify-center text-bad-text"><Icon name="logout" />Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Messages from SAZO, inside the page: only the badge and the title; one opens in full in a pop-up over the page. */
function NotificationsView({ online }: { online: boolean }) {
  const [items, setItems] = useState<Notice[] | null>();
  const [open, setOpen] = useState<Notice>();
  useEffect(() => {
    if (!online) { setItems(null); return; }
    request<{ items: Notice[] }>('/me/announcements').then((r) => setItems(r.items)).catch(() => setItems(null));
  }, [online]);
  const unread = (items ?? []).filter((i) => !i.read).map((i) => i.id);
  const markRead = async (ids: string[]) => {
    await request('/me/announcements/read', { method: 'POST', body: { ids } }).catch(() => undefined);
    setItems((xs) => xs?.map((x) => (ids.includes(x.id) ? { ...x, read: true } : x)));
    window.dispatchEvent(new Event('sazo-notifications-read'));
  };
  const show = (n: Notice) => { setOpen(n); if (!n.read) void markRead([n.id]); };
  if (items === undefined) return <div className="skeleton h-40" />;
  if (items === null) return <p className="text-muted">{online ? 'Could not load your notifications. Try again.' : 'Notifications need the internet.'}</p>;
  if (!items.length) return <p className="text-muted">Nothing from SAZO yet.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card" aria-label="Messages from SAZO">
        {items.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => show(a)} aria-haspopup="dialog"
              className={`flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-soft-2 ${a.read ? '' : 'bg-soft'}`}>
              {!a.read && <span className="chip shrink-0 border-primary-container bg-primary-container text-white">New</span>}
              <span className={`min-w-0 flex-1 truncate ${a.read ? 'font-semibold text-muted' : 'font-bold text-ink'}`}>{a.title}</span>
              <Icon name="chevron_right" size={20} className="shrink-0 text-label" />
            </button>
          </li>
        ))}
      </ul>
      {unread.length > 0 && <button type="button" onClick={() => void markRead(unread)} className="link text-sm font-semibold">Mark all as read</button>}
      <NoticeDialog notice={open} onClose={() => setOpen(undefined)} />
    </div>
  );
}

const AUDIENCE: Record<string, string> = { everyone: 'everyone', buyers: 'buyers', garages: 'garages', dealers: 'dealers', inspectors: 'inspectors', partners: 'data partners', brokers: 'brokers', staff: 'SAZO staff' };

/** One notification in full, over the page. Closed by Close, the cross, Escape or a tap outside. */
function NoticeDialog({ notice, onClose }: { notice?: Notice; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [wasNew, setWasNew] = useState(false);
  useEffect(() => {
    if (notice) { setWasNew(!notice.read); if (!ref.current?.open) ref.current?.showModal(); }
    else ref.current?.close();
  }, [notice]);
  return (
    <dialog ref={ref} aria-labelledby="notice-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto w-[min(520px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/50">
      {notice && (
        <div className="p-6">
          <div className="flex items-center justify-between gap-3">
            {wasNew ? <span className="chip border-primary-container bg-primary-container text-white">New</span> : <span />}
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted hover:bg-soft">
              <Icon name="close" size={18} />
            </button>
          </div>
          <h2 id="notice-title" className="mt-3 font-display text-xl font-bold">{notice.title}</h2>
          <p className="mt-1 text-sm text-muted">{new Date(notice.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <p className="mt-4 whitespace-pre-line leading-relaxed">{notice.body}</p>
          {notice.audience && <p className="mt-4"><span className="rounded-full bg-soft px-2.5 py-1 text-xs text-muted">For {AUDIENCE[notice.audience] ?? notice.audience}</span></p>}
          <div className="mt-6 flex justify-end"><button type="button" onClick={() => ref.current?.close()} className="btn btn-primary">Close</button></div>
        </div>
      )}
    </dialog>
  );
}

/** Settings inside the page: appearance, the business you work for, and where to change your account. */
function SettingsView({ garage, me, onSignOut, onSwitch }: { garage: Garage; me: Me; onSignOut: () => void; onSwitch?: () => void }) {
  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4" aria-labelledby="s-appearance">
        <h2 id="s-appearance" className="font-display text-lg font-semibold">Appearance</h2>
        <ThemePicker />
      </section>
      <section className="card space-y-2 p-4" aria-labelledby="s-business">
        <h2 id="s-business" className="font-display text-lg font-semibold">Your business</h2>
        <p><span className="font-semibold">{garage.name}</span>, {(ROLE[garage.role] ?? 'Staff').toLowerCase()}</p>
        {onSwitch && <button type="button" className="btn btn-ghost" onClick={onSwitch}><Icon name="swap_horiz" />Switch business</button>}
      </section>
      <section className="card space-y-2 p-4" aria-labelledby="s-account">
        <h2 id="s-account" className="font-display text-lg font-semibold">Your account</h2>
        <p className="text-sm text-muted">Signed in as {me.displayName}. Your names, phone number, email and password are changed in Settings on the SAZO website.</p>
        <a href={`${WEBSITE}/account`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-sm font-semibold">Open account settings on the website<Icon name="arrow_forward" size={16} /></a>
      </section>
      <section className="card space-y-2 p-4" aria-labelledby="s-phone">
        <h2 id="s-phone" className="font-display text-lg font-semibold">This phone</h2>
        <p className="text-sm text-muted">Jobs saved without signal are sent when it returns. Signing out removes everything saved on this phone, including jobs not sent yet, so send them first.</p>
        <button type="button" className="btn btn-ghost" onClick={onSignOut}><Icon name="logout" />Sign out</button>
      </section>
    </div>
  );
}

