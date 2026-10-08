import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { vehicleName } from '@/components/vehicle-card';
import { api, isSignedIn } from '@/lib/api';
import type { MyCar } from '@/lib/types';
import { Notice, type SP } from '../admin/notice';
import { removeCar } from './actions';

export const metadata: Metadata = { title: 'My cars' };

const STATUS: Record<MyCar['status'], { text: string; cls: string }> = {
  verified: { text: 'Confirmed owner', cls: 'border-ok-line bg-ok-fill text-ok-text' },
  pending: { text: 'Logbook being checked', cls: 'border-na-line bg-na-fill text-na-text' },
  rejected: { text: 'Not confirmed', cls: 'border-bad-line bg-bad-fill text-bad-text' },
};

export default async function MyCars({ searchParams }: { searchParams: SP }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/my-cars');
  const sp = await searchParams;
  const { items } = await api<{ items: MyCar[] }>('/me/cars', { auth: true });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">My cars</h1>
      <p className="mb-4 mt-1 text-muted">Cars you own. Confirm or dispute garage visits so buyers can trust your car&apos;s history.</p>
      <Notice done={sp.done} error={sp.error} />
      {items.length === 0 ? (
        <div className="card p-4">
          <p>No cars yet. Look up your car, open its report and tap <strong>This is my car</strong>.</p>
          <Link href="/" className="btn btn-primary mt-3"><Icon name="search" />Look up my car</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => {
            const s = STATUS[c.status];
            const v = c.summary?.vehicle;
            return (
              <li key={c.vehicleRef} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {v?.currentPlate && <Plate value={v.currentPlate} size="sm" />}
                  <span className={`chip ${s.cls}`}>{s.text}</span>
                  <span className="text-xs text-muted">added {formatDate(c.claimedAt)}</span>
                </div>
                <h2 className="mt-1 font-display text-lg font-bold">{v ? vehicleName(v) : 'Vehicle'}</h2>
                {c.status === 'pending' && <p className="text-sm text-muted">SAZO is checking your logbook photo. We will text you when it&apos;s done.</p>}
                {c.status === 'rejected' && <p className="text-sm">SAZO could not confirm you own this car{c.reason ? `: ${c.reason}` : '.'} You can send a clearer logbook photo from the car&apos;s report.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status === 'verified' && <Link href={`/my-cars/${c.vehicleRef}`} className="btn btn-primary"><Icon name="build" />Garage visits</Link>}
                  <Link href={`/v/${c.vehicleRef}`} className="btn btn-ghost"><Icon name="description" />Report</Link>
                  {c.status !== 'rejected' && (
                    <form action={removeCar}><input type="hidden" name="ref" value={c.vehicleRef} />
                      <button className="btn btn-ghost"><Icon name="delete" />{c.status === 'pending' ? 'Cancel' : 'Not my car any more'}</button></form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
