import { RECORD_LABELS, formatDate, formatKm } from '@sazo/contracts';

export const TOPIC: Record<string, string> = {
  mileage: 'Mileage', identity: 'Identity', ownership: 'Ownership', damage: 'Damage', finance: 'Finance', spec: 'Specification', care: 'Servicing', legal: 'Legal',
};
export const CONFLICT_STATUS: Record<string, string> = {
  open: 'Open', under_review: 'Being reviewed', auto_resolved: 'Closed by itself', resolved: 'Resolved', dismissed: 'Dismissed',
};
export const CHECK: Record<string, string> = {
  mileage_decrease: 'A later reading is lower', implausible_mileage_rate: 'Too much distance per year', undeclared_engine_change: 'Engine number changed without a record',
  plate_vin_mismatch: 'Plate and chassis disagree', cloned_plate_suspected: 'Plate on two vehicles', identity_collision: 'Records point to different cars',
  spec_mismatch: 'Specification differs', date_impossible: 'Impossible date', duplicate_suspected: 'Possible duplicate vehicle',
};

/** One record in plain words for reviewers (they may see full attributes; never internal ids). */
export function recordLine(type: string, a: Record<string, unknown>): string {
  if (type === 'odometer_reading') return formatKm(a.km) + (a.originalUnit === 'mi' ? ` (read as ${Number(a.originalValue).toLocaleString('en-UG')} mi)` : '');
  const parts = Object.entries(a)
    .filter(([k, v]) => v !== null && v !== undefined && !/Id$/.test(k))
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? Object.values(v as object).join(' ') : String(v)}`);
  return parts.join(' · ') || '—';
}
export const recordLabel = (t: string) => RECORD_LABELS[t] ?? t;
export const day = (iso: string | null, p = 'day') => formatDate(iso, p);
