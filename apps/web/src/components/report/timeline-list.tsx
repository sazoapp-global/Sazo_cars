// A car's dated records, newest first: on the car's public page and inside the workspaces (28 Oct 2026).
import { EVENT_LABELS, RECORD_LABELS, formatDate, formatKm } from '@sazo/contracts';
import { Icon, type IconName } from '../icon';
import type { TimelineItem } from '@/lib/types';

const EVENT_ICONS: Record<string, IconName> = {
  garage_job: 'build', inspection: 'list_alt', import: 'public', registration: 'description', police_report: 'local_police',
  finance_change: 'account_balance', insurance_event: 'car_crash', auction_sale: 'sell', rental_period: 'directions_car', owner_submission: 'person',
};
const CONFIRMATION: Record<TimelineItem['ownerConfirmation'], { text: string; cls: string } | undefined> = {
  confirmed: { text: 'Confirmed by the customer', cls: 'border-ok-line bg-ok-fill text-ok-text' },
  disputed: { text: 'Disputed by the customer', cls: 'border-bad-line bg-bad-fill text-bad-text' },
  pending: { text: 'Waiting for the customer to confirm', cls: 'border-na-line bg-na-fill text-na-text' },
  not_requested: undefined,
};

export function TimelineList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="text-muted">No dated records for this car yet.</p>;
  return (
    <ol className="relative space-y-4 border-l-2 border-soft-3 pl-6">
      {items.map((e) => {
        const serious = e.flags.some((f) => f.severity === 'serious');
        const confirmation = CONFIRMATION[e.ownerConfirmation];
        return (
          <li key={e.eventId} className="relative">
            <span className={`absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white ${serious ? 'border-bad-text text-bad-text' : 'border-primary-container text-primary-container'}`}>
              <Icon name={EVENT_ICONS[e.type] ?? 'history'} size={16} />
            </span>
            <article className={`card p-4 ${serious ? '!border-bad-line' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 className="font-display font-semibold">{EVENT_LABELS[e.type] ?? 'Record'}</h2>
                <time className="text-sm font-semibold text-label" dateTime={e.time.at ?? undefined}>{formatDate(e.time.at, e.time.precision)}</time>
              </div>
              <p className="text-sm text-muted">{(e.params.records ?? []).map((t) => RECORD_LABELS[t] ?? t).join(' · ')}</p>
              {e.mileageKm !== null && <p className="mt-1 font-semibold tabular-nums"><Icon name="speed" size={16} className="mr-1 inline align-[-3px] text-label" />{formatKm(e.mileageKm)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="chip chip-class">{e.sourceLabel}</span>
                {e.evidenceCount > 0 && <span className="chip chip-class"><Icon name="photo_camera" size={14} />{e.evidenceCount} {e.evidenceCount === 1 ? 'photo' : 'photos'}</span>}
                {confirmation && <span className={`chip ${confirmation.cls}`}>{confirmation.text}</span>}
                {serious && <span className="chip border-bad-line bg-bad-fill text-bad-text"><Icon name="report" size={14} />Disagrees with other records</span>}
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
