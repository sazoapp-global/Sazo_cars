const DAY = 86_400_000;

export const ms = (iso: string): number => Date.parse(iso);
export const daysBetween = (a: string, b: string): number => (ms(b) - ms(a)) / DAY;
export const monthsBetween = (a: string, b: string): number => daysBetween(a, b) / 30.4375;
export const yearOf = (iso: string): number => new Date(iso).getUTCFullYear();

/** Sort helper: by event time, unknown times last, then recordedAt. */
export function byEventTime<T extends { eventTime: string | null; recordedAt: string }>(a: T, b: T): number {
  if (a.eventTime && b.eventTime) return ms(a.eventTime) - ms(b.eventTime) || ms(a.recordedAt) - ms(b.recordedAt);
  if (a.eventTime) return -1;
  if (b.eventTime) return 1;
  return ms(a.recordedAt) - ms(b.recordedAt);
}
