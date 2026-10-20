'use client';
// The console menu: Overview on its own, the other sections grouped in dropdowns. The group holding the
// page you are on starts open.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/icon';

type Item = { href: string; label: string; icon: IconName };
const GROUPS: { label: string; icon: IconName; items: Item[] }[] = [
  { label: 'Accounts', icon: 'group', items: [
    { href: '/admin/organisations', label: 'Businesses', icon: 'garage' },
    { href: '/admin/identity', label: 'ID checks', icon: 'badge' },
    { href: '/admin/brokers', label: 'Brokers', icon: 'handshake' },
    { href: '/admin/ownership', label: 'Ownership claims', icon: 'key' },
    { href: '/admin/people', label: "People's data", icon: 'person' },
  ] },
  { label: 'Cars and records', icon: 'directions_car', items: [
    { href: '/admin/matches', label: 'Vehicle matches', icon: 'directions_car' },
    { href: '/admin/conflicts', label: 'Conflicts', icon: 'warning' },
    { href: '/admin/concerns', label: 'Reported problems', icon: 'report' },
    { href: '/admin/sources', label: 'Data sources', icon: 'account_balance' },
    { href: '/admin/rebuild', label: 'Recalculate', icon: 'history' },
    { href: '/partner', label: 'Send records', icon: 'receipt_long' },
  ] },
  { label: 'Messages and content', icon: 'forum', items: [
    { href: '/admin/moderation', label: 'Reviews and videos', icon: 'forum' },
    { href: '/admin/announcements', label: 'Announcements', icon: 'notifications' },
    { href: '/admin/faqs', label: 'Help answers', icon: 'help_center' },
  ] },
];

const link = 'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold hover:bg-soft hover:text-primary-container';

export function AdminNav() {
  const path = usePathname() ?? '';
  const here = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Admin" className="md:w-56 md:shrink-0">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-label">SAZO admin</p>
      <Link href="/admin" aria-current={here('/admin') ? 'page' : undefined} className={`${link} ${here('/admin') ? 'bg-soft text-primary-container' : ''}`}><Icon name="list_alt" size={18} />Overview</Link>
      {GROUPS.map((g) => (
        <details key={g.label} open={g.items.some((i) => here(i.href)) || undefined} className="group mt-1">
          <summary className={`${link} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <Icon name={g.icon} size={18} /><span className="flex-1">{g.label}</span>
            <Icon name="keyboard_arrow_down" size={18} className="transition-transform group-open:rotate-180" />
          </summary>
          <ul className="ml-4 border-l border-line pl-1">
            {g.items.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={here(n.href) ? 'page' : undefined} className={`${link} ${here(n.href) ? 'bg-soft text-primary-container' : ''}`}><Icon name={n.icon} size={18} />{n.label}</Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  );
}
