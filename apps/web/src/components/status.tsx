import { STATUS_LABELS } from '@sazo/contracts';
import type { Status } from '@/lib/types';
import { Icon, type IconName } from './icon';

/** Icon + word + colour, never colour alone (contrast-corrected palette). */
const STYLE: Record<Status, { cls: string; icon: IconName }> = {
  verified: { cls: 'text-ok-text bg-ok-fill border-ok-line', icon: 'check_circle' },
  attention: { cls: 'text-warn-text bg-warn-fill border-warn-line', icon: 'info' },
  serious: { cls: 'text-bad-text bg-bad-fill border-bad-line', icon: 'report' },
  not_available: { cls: 'text-na-text bg-na-fill border-na-line', icon: 'help' },
};

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  const s = STYLE[status];
  return (
    <span className={`chip ${s.cls}`}>
      <Icon name={s.icon} size={14} />
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}

export function statusIcon(status: Status): { icon: IconName; cls: string } {
  const s = STYLE[status];
  return { icon: s.icon, cls: s.cls.split(' ')[0]! };
}
