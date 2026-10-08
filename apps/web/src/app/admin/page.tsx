import Link from 'next/link';
import type { Conflict, Decision, Organisation } from '@/lib/types';
import { adminFetch, requireStaff } from './guard';

export default async function AdminHome() {
  const me = await requireStaff('/admin');
  const [orgs, conflicts, matches] = await Promise.all([
    adminFetch<{ items: Organisation[] }>('/admin/organisations?status=pending_verification'),
    adminFetch<{ items: Conflict[] }>('/admin/conflicts'),
    adminFetch<{ items: Decision[] }>('/admin/resolutions?outcome=ambiguous'),
  ]);
  const count = (x: { items: unknown[] } | 'forbidden') => (x === 'forbidden' ? '—' : String(x.items.length));
  const cards = [
    { href: '/admin/organisations', n: count(orgs), label: 'businesses waiting for approval', hint: 'Garages cannot record history until approved (D-055).' },
    { href: '/admin/conflicts', n: count(conflicts), label: 'open conflicts', hint: 'Records that disagree — resolve with written reasoning.' },
    { href: '/admin/matches', n: count(matches), label: 'records waiting for a vehicle match', hint: 'SAZO could not tell which car a record belongs to.' },
  ];
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Good to see you, {me.displayName}</h1>
      <p className="text-muted">What needs a person today.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card block p-5 hover:border-line-strong">
            <p className="font-display text-4xl font-extrabold text-primary">{c.n}</p>
            <p className="font-semibold">{c.label}</p>
            <p className="mt-1 text-sm text-muted">{c.hint}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
