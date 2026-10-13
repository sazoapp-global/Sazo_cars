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

const TONES = { ok: 'text-ok-text bg-ok-fill border-ok-line', warn: 'text-warn-text bg-warn-fill border-warn-line', bad: 'text-bad-text bg-bad-fill border-bad-line', na: 'text-na-text bg-na-fill border-na-line' } as const;
export type RowStatus = { key: string; text: string; cls: string; icon: IconName };
/** One label per job for lists: where it stands now, including the customer's answer. */
export function rowStatus(j: { status: string; ownerConfirmation?: string }): RowStatus {
  const s = (key: string, text: string, tone: 'ok' | 'warn' | 'bad' | 'na', icon: IconName) => ({ key, text, icon, cls: TONES[tone] });
  if (j.status === 'draft') return s('draft', 'Draft', 'na', 'edit');
  if (j.status === 'rejected') return s('rejected', 'Not accepted', 'bad', 'report');
  if (j.ownerConfirmation === 'disputed') return s('disputed', 'Customer disputed', 'bad', 'report');
  if (j.status === 'submitted') return s('checking', 'Being checked', 'warn', 'hourglass_empty');
  if (j.ownerConfirmation === 'confirmed') return s('confirmed', 'Customer confirmed', 'ok', 'check_circle');
  if (j.ownerConfirmation === 'pending') return s('waiting', 'Waiting for customer', 'na', 'sms');
  return s('history', 'In vehicle history', 'ok', 'check');
}
export const STATUS_FILTERS: [string, string][] = [
  ['all', 'All'], ['draft', 'Drafts'], ['checking', 'Being checked'], ['history', 'In vehicle history'], ['confirmed', 'Customer confirmed'],
  ['waiting', 'Waiting for customer'], ['disputed', 'Customer disputed'], ['rejected', 'Not accepted'],
];
export const kmOfJob = (m?: { value: number; unit: string }) => (m ? (m.unit === 'mi' ? Math.round(m.value * 1.609344) : m.value) : undefined);
/** "Anguzu J. Mike" → "Mike" (names are shown surname first, D-103). */
export const firstName = (displayName: string) => displayName.trim().split(/\s+/).at(-1) ?? displayName;
