import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, isSignedIn } from '@/lib/api';
import type { Booking, BookingStatus } from '@/lib/types';
import { cancelBooking } from './actions';

export const metadata: Metadata = { title: 'Your inspections', robots: { index: false } };

const STATUS: Record<BookingStatus, { text: string; cls: string }> = {
  requested: { text: 'Waiting for the inspector', cls: 'bg-warn-fill text-warn-text' },
  accepted: { text: 'Booked', cls: 'bg-ok-fill text-ok-text' },
  declined: { text: 'Declined', cls: 'bg-bad-fill text-bad-text' },
  cancelled: { text: 'Cancelled', cls: 'bg-soft text-muted' },
  done: { text: 'Done', cls: 'bg-soft text-ink' },
};
const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export default async function Inspections({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/inspections');
  const { booked } = await searchParams;
  const { items } = await api<{ items: Booking[] }>('/me/bookings', { auth: true });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Your inspections</h1>
        <Link href="/inspections/book" className="btn btn-primary">Book an inspection</Link>
      </div>
      {booked && <p role="status" className="mt-4 rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">Request sent. The inspector has been told by SMS, and you will get an SMS when they reply.</p>}
      {items.length === 0 ? <p className="card mt-6 p-4">No inspections booked yet. Open a car&apos;s report and tap <strong>Book an inspection</strong>.</p> : (
        <ul className="mt-6 space-y-3">
          {items.map((b) => (
            <li key={b.bookingId} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold"><span className="sazo-id">{b.plate}</span> with {b.inspector.name}</p>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS[b.status].cls}`}>{STATUS[b.status].text}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {b.status === 'accepted' && b.scheduledAt ? <>On <strong className="text-ink">{when(b.scheduledAt)}</strong></> : <>Preferred day {formatDate(b.preferredDate)}</>}
                {b.place ? ` · ${b.place}` : ''}
              </p>
              {b.inspector.phone && <p className="mt-1 text-sm">Inspector&apos;s phone: <a className="link" href={`tel:${b.inspector.phone}`}>{b.inspector.phone}</a></p>}
              {b.responseNote && <p className="mt-1 text-sm">Inspector&apos;s note: {b.responseNote}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {b.vehicleRef && <Link className="btn btn-ghost" href={`/v/${b.vehicleRef}`}>Open the report</Link>}
                {(b.status === 'requested' || b.status === 'accepted') && (
                  <form action={cancelBooking}><input type="hidden" name="id" value={b.bookingId} /><button className="btn btn-ghost">Cancel</button></form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
