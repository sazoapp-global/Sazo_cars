// I-07: buyers' requests to inspect a car. Accept with a day and time, decline with a reason, mark done after the visit.
// Needs signal: answers go straight to SAZO and the buyer is told by SMS.
import { formatDate } from '@sazo/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/icon';
import { PlateText } from '../components/bits';
import { ApiError, OfflineError, request } from '../lib/api';
import type { Garage, InspectionBooking } from '../lib/types';

const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

export function BookingRequests({ workplace, onStart }: { workplace: Garage; onStart: (plate: string) => void }) {
  const [items, setItems] = useState<InspectionBooking[] | undefined>();
  const [offline, setOffline] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await request<{ items: InspectionBooking[] }>('/inspection-bookings', { org: workplace.id });
      setItems(res.items.filter((b) => b.status === 'requested' || b.status === 'accepted'));
      setOffline(false);
    } catch (err) {
      if (err instanceof OfflineError) setOffline(true);
      else throw err;
    }
  }, [workplace.id]);
  useEffect(() => { void load(); }, [load]);

  if (offline) return <p className="text-sm text-muted">Booking requests show when there is signal.</p>;
  if (!items?.length) return null;
  return (
    <section aria-labelledby="bookings">
      <h2 id="bookings" className="font-display text-lg font-bold">Booking requests</h2>
      <ul className="mt-2 space-y-2">{items.map((b) => <BookingCard key={b.bookingId} b={b} workplace={workplace} onChanged={load} onStart={onStart} />)}</ul>
    </section>
  );
}

function BookingCard({ b, workplace, onChanged, onStart }: { b: InspectionBooking; workplace: Garage; onChanged: () => Promise<void>; onStart: (plate: string) => void }) {
  const [mode, setMode] = useState<'view' | 'accept' | 'decline'>('view');
  const [at, setAt] = useState(`${b.preferredDate}T10:00`);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function send(body: object) {
    setBusy(true);
    setError(undefined);
    try {
      await request(`/inspection-bookings/${b.bookingId}/decision`, { method: 'POST', org: workplace.id, body });
      setMode('view');
      await onChanged();
    } catch (err) {
      setError(err instanceof OfflineError ? 'No signal. Try again when you are online.' : err instanceof ApiError ? err.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <PlateText value={b.plate} />
        <span className={`chip ${b.status === 'accepted' ? 'border-ok-line bg-ok-fill text-ok-text' : 'border-warn-line bg-warn-fill text-warn-text'}`}>{b.status === 'accepted' ? 'Booked' : 'New request'}</span>
      </div>
      <p className="text-sm">{b.buyer.givenName} · {b.status === 'accepted' && b.scheduledAt ? <strong>{time(b.scheduledAt)}</strong> : <>prefers {formatDate(b.preferredDate)}</>}{b.place ? ` · ${b.place}` : ''}</p>
      {b.note && <p className="text-sm text-muted">“{b.note}”</p>}
      {b.buyer.phone && <p className="text-sm"><a className="font-semibold text-primary-container underline" href={`tel:${b.buyer.phone}`}><Icon name="call" size={16} className="mr-1 inline align-[-3px]" />{b.buyer.phone}</a></p>}
      {error && <p role="alert" className="text-sm font-semibold text-bad-text">{error}</p>}
      {mode === 'accept' && (
        <div className="space-y-2">
          <label htmlFor={`at-${b.bookingId}`} className="label">Day and time</label>
          <input id={`at-${b.bookingId}`} type="datetime-local" className="field" value={at} onChange={(e) => setAt(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" disabled={busy || !at} onClick={() => void send({ decision: 'accept', scheduledAt: `${at}:00+03:00` })}>Confirm booking</button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode('view')}>Back</button>
          </div>
        </div>
      )}
      {mode === 'decline' && (
        <div className="space-y-2">
          <label htmlFor={`why-${b.bookingId}`} className="label">Why can you not do it? The buyer sees this.</label>
          <textarea id={`why-${b.bookingId}`} className="field" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" disabled={busy || note.trim().length < 3} onClick={() => void send({ decision: 'decline', note })}>Decline request</button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode('view')}>Back</button>
          </div>
        </div>
      )}
      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          {b.status === 'requested' && <button type="button" className="btn btn-primary" onClick={() => setMode('accept')}>Accept</button>}
          {b.status === 'accepted' && <button type="button" className="btn btn-primary" onClick={() => onStart(b.plate)}><Icon name="add" size={20} />Start inspection</button>}
          {b.status === 'accepted' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void send({ decision: 'done' })}>Mark done</button>}
          <button type="button" className="btn btn-ghost" onClick={() => setMode('decline')}>Decline</button>
        </div>
      )}
    </li>
  );
}
