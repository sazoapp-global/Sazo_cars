import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · SAZO admin' }, robots: { index: false, follow: false } };

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/admin', label: 'Overview', icon: 'list_alt' },
  { href: '/admin/organisations', label: 'Businesses', icon: 'garage' },
  { href: '/admin/ownership', label: 'Ownership claims', icon: 'key' },
  { href: '/admin/concerns', label: 'Reported problems', icon: 'report' },
  { href: '/admin/conflicts', label: 'Conflicts', icon: 'warning' },
  { href: '/admin/matches', label: 'Vehicle matches', icon: 'directions_car' },
  { href: '/admin/sources', label: 'Data sources', icon: 'account_balance' },
  { href: '/admin/rebuild', label: 'Recalculate', icon: 'history' },
  { href: '/partner', label: 'Send records', icon: 'receipt_long' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 md:flex-row md:px-8">
      <nav aria-label="Admin" className="md:w-56 md:shrink-0">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-label">SAZO admin</p>
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((n) => (
            <li key={n.href}><Link href={n.href} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold hover:bg-soft hover:text-primary-container"><Icon name={n.icon} size={18} />{n.label}</Link></li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
