import { CONCERNS, CONCERN_UNDER_REVIEW } from '@sazo/contracts';
import type { VehicleNotice } from '@/lib/types';
import { Icon } from './icon';

/** Concerns raised by businesses (O-002): neutral while SAZO checks; specific once SAZO has upheld one. */
export function ConcernNotices({ notices }: { notices?: VehicleNotice[] }) {
  if (!notices?.length) return null;
  return (
    <div className="space-y-2">
      {notices.map((n) => n.kind === 'under_review' ? (
        <p key="review" role="note" className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-fill p-3 font-semibold text-warn-text">
          <Icon name="hourglass_empty" size={18} className="mt-0.5 shrink-0" />{CONCERN_UNDER_REVIEW}</p>
      ) : (
        <p key={n.category} role="note" className="flex items-start gap-2 rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">
          <Icon name="report" size={18} className="mt-0.5 shrink-0" />{CONCERNS[n.category].upheld}</p>
      ))}
    </div>
  );
}
