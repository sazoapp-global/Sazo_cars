import { WORK_LABELS, formatDate } from '@sazo/contracts';
import { Icon, type IconName } from './icon';

export const OWNER: Record<string, { text: string; cls: string; icon: IconName }> = {
  confirmed: { text: 'Customer confirmed', cls: 'text-ok-text bg-ok-fill border-ok-line', icon: 'check_circle' },
  disputed: { text: 'Customer disputed', cls: 'text-bad-text bg-bad-fill border-bad-line', icon: 'report' },
  pending: { text: 'Waiting for customer', cls: 'text-na-text bg-na-fill border-na-line', icon: 'sms' },
  not_requested: { text: 'No customer SMS', cls: 'text-na-text bg-na-fill border-na-line', icon: 'help' },
};

export const JOB_STATUS: Record<string, { text: string; cls: string; icon: IconName }> = {
  accepted: { text: 'In vehicle history', cls: 'text-ok-text bg-ok-fill border-ok-line', icon: 'check_circle' },
  submitted: { text: 'SAZO is checking the car', cls: 'text-warn-text bg-warn-fill border-warn-line', icon: 'hourglass_empty' },
  rejected: { text: 'Not accepted', cls: 'text-bad-text bg-bad-fill border-bad-line', icon: 'report' },
  draft: { text: 'Draft', cls: 'text-na-text bg-na-fill border-na-line', icon: 'edit' },
};

export function Chip({ s }: { s: { text: string; cls: string; icon: IconName } }) {
  return <span className={`chip ${s.cls}`}><Icon name={s.icon} size={14} />{s.text}</span>;
}

export const works = (types: string[]) => types.map((t) => WORK_LABELS[t] ?? t).join(', ');
export const when = (iso: string) => formatDate(iso);

export function PlateText({ value }: { value: string }) {
  return <span className="sazo-id inline-block rounded bg-soft-3 px-2 py-0.5 text-sm font-extrabold text-primary"><span aria-hidden>UG • </span>{value.toUpperCase()}</span>;
}
