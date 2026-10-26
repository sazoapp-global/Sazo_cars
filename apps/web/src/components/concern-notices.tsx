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

/**
 * A dealer's instalment sale (D-123): only whether a dealer is still owed money on the car. No amounts or names.
 */
export function DealerBalanceNote({ statuses }: { statuses?: { dealerBalance?: 'owed' | 'paid' | null } }) {
  if (statuses?.dealerBalance === 'owed') {
    return (
      <p role="note" className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-fill p-3 font-semibold text-warn-text">
        <Icon name="account_balance" size={18} className="mt-0.5 shrink-0" />Balance still owed to a dealer: yes. Someone is paying a dealer for this car in instalments. Ask the dealer before you buy.
      </p>
    );
  }
  if (statuses?.dealerBalance === 'paid') {
    return <p role="note" className="flex items-start gap-2 rounded-lg border border-ok-line bg-ok-fill p-3 text-sm font-semibold text-ok-text"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0" />Balance owed to a dealer: no. The dealer marked it paid in full.</p>;
  }
  return null;
}
