// The workspace frame (Partners design P1 + P7, in SAZO's colours). Tablets and computers get a navy side
// menu with the business name and counts; phones get a top bar, an offline banner and a bottom tab bar.
import { isInspector, type Garage, type Me } from '../lib/types';
import { go, type Route } from '../lib/route';
import { Icon, type IconName } from './icon';
import { ThemePicker } from './theme-picker';

interface Item { route: Route['name']; label: string; icon: IconName; count?: number; badge?: number }

const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff' };

export function Shell({ garage, me, route, online, unsent, records, needsAction, onSignOut, children }: {
  garage: Garage; me: Me; route: Route; online: boolean; unsent: number; records?: number; needsAction: number; onSignOut: () => void; children: React.ReactNode;
}) {
  const inspector = isInspector(garage);
  const items: Item[] = [
    { route: 'home', label: 'Home', icon: 'home' },
    ...(!inspector ? [{ route: 'records' as const, label: 'Job records', icon: 'receipt_long' as const, count: records }, { route: 'alerts' as const, label: 'Alerts', icon: 'notifications' as const, badge: needsAction }] : []),
    { route: 'concerns', label: 'Report a problem', icon: 'flag' },
    ...(garage.role === 'org_manager' ? [{ route: 'staff' as const, label: 'Team', icon: 'group' as const }] : []),
  ];
  const tabs: Item[] = inspector
    ? [{ route: 'home', label: 'Home', icon: 'home' }, { route: 'concerns', label: 'Report', icon: 'flag' }, { route: 'more', label: 'More', icon: 'more_horiz' }]
    : [{ route: 'home', label: 'Home', icon: 'home' }, { route: 'records', label: 'Records', icon: 'receipt_long' }, { route: 'alerts', label: 'Alerts', icon: 'notifications', badge: needsAction }, { route: 'more', label: 'More', icon: 'more_horiz' }];
  const current = route.name === 'job' || route.name === 'server-job' ? 'records' : route.name === 'inspection' || route.name === 'server-inspection' ? 'home' : route.name;
  const inWizard = route.name === 'job' || route.name === 'inspection';
  const app = inspector ? 'SAZO Inspect' : 'SAZO Garage';

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* side menu: tablets and computers */}
      <aside aria-label={app} className="sticky top-0 hidden h-dvh flex-col border-r-4 border-lime bg-primary text-white lg:flex">
        <div className="border-b border-white/15 px-5 py-4">
          <p className="flex items-center gap-2 font-display font-extrabold"><span aria-hidden className="grid size-7 place-items-center rounded-md bg-lime text-primary"><Icon name={inspector ? 'fact_check' : 'garage'} size={18} /></span>{app}</p>
          <p className="mt-3 font-semibold leading-snug">{garage.name}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink"><Icon name="verified_user" size={12} />Approved by SAZO</span>
        </div>
        <nav aria-label="Workspace" className="flex-1 py-2">
          <ul>
            {items.map((it) => {
              const active = current === it.route;
              return (
                <li key={it.route}>
                  <button type="button" onClick={() => go({ name: it.route } as Route)} aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 border-l-4 px-4 py-2.5 text-left text-[15px] ${active ? 'border-lime bg-primary-container font-bold' : 'border-transparent hover:bg-white/10'}`}>
                    <Icon name={it.icon} size={20} className={active ? 'text-lime' : 'text-white/80'} />
                    <span className="flex-1">{it.label}</span>
                    {it.count !== undefined && <span className="text-sm text-white/75">{it.count.toLocaleString('en-UG')}</span>}
                    {!!it.badge && <span className="rounded bg-lime px-1.5 text-xs font-extrabold text-ink" aria-label={`${it.badge} need attention`}>{it.badge}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-white/15 px-5 py-4 text-sm">
          <p role="status" aria-live="polite" className={`mb-3 flex items-center gap-1.5 font-semibold ${online ? 'text-white/85' : 'text-lime'}`}>
            <Icon name={online ? 'cloud_done' : 'wifi_off'} size={16} />{online ? 'Online' : 'No signal — saving here'}
          </p>
          <div className="mb-4"><ThemePicker onNavy /></div>
          <p className="font-semibold">{me.displayName}</p>
          <p className="text-white/75">{ROLE[garage.role] ?? 'Staff'}</p>
          <button type="button" onClick={onSignOut} className="mt-3 inline-flex items-center gap-1.5 text-white/85 underline-offset-2 hover:underline"><Icon name="logout" size={16} />Sign out</button>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* top bar: phones */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-4 border-lime bg-primary px-4 py-3 text-white lg:hidden">
          <button type="button" onClick={() => go({ name: 'home' })} className="min-w-0 text-left">
            <span className="block font-display text-lg font-extrabold leading-tight">{app}</span>
            <span className="block truncate text-sm text-white/80">{garage.name}</span>
          </button>
          <span role="status" aria-live="polite" className={`chip !border-0 ${online ? 'bg-white/15 text-white' : 'bg-lime text-ink'}`}>
            <Icon name={online ? 'cloud_done' : 'wifi_off'} size={14} />{online ? 'Online' : 'Offline'}
          </span>
        </header>
        {!online && (
          <div className="bg-ink px-4 py-2.5 text-sm text-white">
            <p className="font-bold">You’re offline</p>
            <p className="text-white/85">{unsent ? `${unsent} ${unsent === 1 ? 'job is' : 'jobs are'} saved on this phone. They’ll upload automatically when there’s signal.` : 'Keep working — everything is saved on this phone and uploads when there’s signal.'}</p>
          </div>
        )}
        <main className={`flex-1 ${inWizard ? '' : 'pb-24 lg:pb-0'}`}>{children}</main>

        {/* bottom tabs: phones */}
        {!inWizard && (
          <nav aria-label="Workspace" className="fixed inset-x-0 bottom-0 z-20 grid border-t-2 border-ink bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
            {tabs.map((t) => {
              const active = current === t.route || (t.route === 'more' && (current === 'staff' || current === 'more'));
              return (
                <button key={t.route} type="button" onClick={() => go({ name: t.route } as Route)} aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? '-mt-0.5 border-t-4 border-primary-container text-primary-container' : 'text-muted'}`}>
                  <Icon name={t.icon} size={22} />{t.label}
                  {!!t.badge && <span className="absolute right-[calc(50%-22px)] top-2 min-w-5 rounded-full bg-bad-text px-1 text-[11px] font-bold leading-5 text-white" aria-label={`${t.badge} need attention`}>{t.badge}</span>}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
