// The business workspace frame (Partners design P1/P3, in SAZO's colours): a navy side menu with the
// business name and counts on wide screens, a compact strip of links on phones.
import Link from 'next/link';
import { Icon, type IconName } from './icon';

export interface FrameItem { href: string; label: string; icon: IconName; count?: number; active?: boolean }

export function WorkspaceFrame({ kind, name, approved, items, person, children }: {
  kind: string; name: string; approved: boolean; items: FrameItem[]; person?: { name: string; role: string }; children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 lg:px-12">
      <div className="overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_2px_4px_rgba(11,19,43,0.06),0_18px_44px_rgba(11,19,43,0.10)] lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside aria-label={`${kind} workspace`} className="border-b-4 border-lime bg-primary text-white lg:border-b-0 lg:border-r-4">
          <div className="border-b border-white/15 px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">{kind}</p>
            <p className="font-display text-lg font-bold leading-snug">{name}</p>
            {approved && <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink"><Icon name="verified_user" size={12} />Approved by SAZO</span>}
          </div>
          <nav aria-label={`${kind} menu`}>
            <ul className="flex overflow-x-auto lg:block lg:py-2">
              {items.map((it) => (
                <li key={it.href} className="shrink-0">
                  <Link href={it.href} aria-current={it.active ? 'page' : undefined}
                    className={`flex items-center gap-3 border-b-4 px-4 py-3 text-[15px] lg:border-b-0 lg:border-l-4 lg:py-2.5 ${it.active ? 'border-lime bg-primary-container font-bold' : 'border-transparent hover:bg-white/10'}`}>
                    <Icon name={it.icon} size={20} className={it.active ? 'text-lime' : 'text-white/80'} />
                    <span className="flex-1 whitespace-nowrap">{it.label}</span>
                    {it.count !== undefined && <span className="text-sm text-white/75">{it.count.toLocaleString('en-UG')}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {person && (
            <div className="hidden border-t border-white/15 px-5 py-4 text-sm lg:block">
              <p className="font-semibold">{person.name}</p>
              <p className="text-white/75">{person.role}</p>
            </div>
          )}
        </aside>
        <div className="min-w-0 space-y-6 p-4 md:p-7">{children}</div>
      </div>
    </div>
  );
}

/** A ruled row of figures (Partners design): label, number, a short line underneath. */
export function NumberStrip({ cells }: { cells: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' }[] }) {
  return (
    <dl className={`grid grid-cols-2 border-y-2 border-t-ink border-b-line-strong ${cells.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
      {cells.map((c, i) => (
        <div key={c.label} className={`py-3 pr-4 ${i % 2 === 0 ? 'border-r border-line' : 'pl-4 md:border-r md:border-line'} ${i > 0 && i % 2 === 0 ? 'md:pl-4' : ''} ${i < cells.length - 2 ? 'border-b border-line md:border-b-0' : ''} ${i === cells.length - 1 ? 'md:!border-r-0' : ''}`}>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-label">{c.label}</dt>
          <dd className={`font-display text-3xl font-extrabold tabular-nums ${c.tone === 'bad' ? 'text-bad-text' : 'text-ink'}`}>{c.value}</dd>
          {c.sub && <dd className={`text-xs ${c.tone === 'ok' ? 'font-semibold text-ok-text' : 'text-muted'}`}>{c.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
