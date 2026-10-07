// Mileage series, odometer-replacement segments (G1), unit conversion (G7) and checks C1/C2.
import { MILES_TO_KM } from '@sazo/contracts';
import type { UsageType } from '@sazo/contracts';
import { PARAMS } from './params.js';
import { daysBetween, ms } from './time.js';
import type { EngineObservation, Flag } from './types.js';

export interface Reading {
  obsId: string;
  time: string;
  km: number;
  fromExport: boolean;
  segment: number;
}

export interface ClusterSwap {
  obsId: string;
  time: string;
  before: number;
  after: number;
}

export interface MileageSeries {
  readings: Reading[];
  swaps: ClusterSwap[];
  segments: number;
}

const toKm = (d: unknown): number | undefined => {
  if (!d || typeof d !== 'object') return undefined;
  const { value, unit } = d as { value?: number; unit?: string };
  if (typeof value !== 'number') return undefined;
  return Math.round(unit === 'mi' ? value * MILES_TO_KM : value);
};

export function buildMileageSeries(obs: EngineObservation[]): MileageSeries {
  const swaps: ClusterSwap[] = obs
    .filter((o) => o.type === 'component_replaced' && o.attributes.component === 'instrument_cluster' && o.eventTime)
    .map((o) => ({
      obsId: o.id,
      time: o.eventTime!,
      before: Number(o.attributes.readingBefore),
      after: Number(o.attributes.readingAfter),
    }))
    .sort((a, b) => ms(a.time) - ms(b.time));

  const raw: Omit<Reading, 'segment'>[] = [];
  for (const o of obs) {
    if (!o.eventTime) continue;
    if (o.type === 'odometer_reading' && typeof o.attributes.km === 'number') {
      raw.push({ obsId: o.id, time: o.eventTime, km: o.attributes.km, fromExport: false });
    }
    if (o.type === 'import_recorded' || o.type === 'auction_sale') {
      const km = toKm(o.attributes.exportMileage);
      if (km !== undefined) raw.push({ obsId: o.id, time: o.eventTime, km, fromExport: true });
    }
  }

  const readings = raw
    .map((r) => {
      let segment = 0;
      for (const s of swaps) {
        const sameDay = Math.abs(daysBetween(s.time, r.time)) < 1;
        // A same-day reading still close to the old cluster's value belongs before the swap.
        if (ms(r.time) > ms(s.time) || (sameDay && r.km < s.before * (1 - PARAMS.mileage.decreaseTolerance))) segment++;
      }
      return { ...r, segment };
    })
    .sort((a, b) => ms(a.time) - ms(b.time));

  return { readings, swaps, segments: swaps.length + 1 };
}

export type UsageAt = (time: string) => UsageType;

export function usageTimeline(obs: EngineObservation[]): UsageAt {
  const rentals = obs
    .filter((o) => o.type === 'rental_period')
    .map((o) => ({ from: String(o.attributes.from), to: o.attributes.to ? String(o.attributes.to) : undefined }));
  const declared = obs
    .filter((o) => o.type === 'usage_declared' && o.eventTime)
    .map((o) => ({ time: o.eventTime!, usage: o.attributes.usage as UsageType }))
    .sort((a, b) => ms(a.time) - ms(b.time));
  return (time) => {
    const t = ms(time);
    if (rentals.some((r) => ms(r.from) <= t && (!r.to || t <= ms(r.to) + 86_400_000))) return 'rental';
    let usage: UsageType = 'private';
    for (const d of declared) if (ms(d.time) <= t) usage = d.usage;
    return usage;
  };
}

/** C1 mileage_decrease and C2 implausible_mileage_rate. */
export function mileageFlags(series: MileageSeries, usageAt: UsageAt): Flag[] {
  const flags: Flag[] = [];
  const p = PARAMS.mileage;
  for (let seg = 0; seg < series.segments; seg++) {
    const rs = series.readings.filter((r) => r.segment === seg);
    let max: Reading | undefined;
    for (const r of rs) {
      if (max && r.km < max.km * (1 - p.decreaseTolerance)) {
        flags.push({
          check: 'mileage_decrease',
          severity: 'serious',
          observationIds: [max.obsId, r.obsId],
          details: { earlierKm: max.km, laterKm: r.km, involvesExport: max.fromExport || r.fromExport },
        });
        continue;
      }
      if (!max || r.km >= max.km) max = r;
    }
    for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1]!;
      const b = rs[i]!;
      const days = daysBetween(a.time, b.time);
      if (days < p.minDaysBetweenForRate || b.km <= a.km) continue;
      const rate = ((b.km - a.km) / days) * 365;
      const threshold = p.annualThreshold[usageAt(b.time)];
      if (rate > threshold) {
        flags.push({
          check: 'implausible_mileage_rate',
          severity: 'attention',
          observationIds: [a.obsId, b.obsId],
          details: { kmPerYear: Math.round(rate), threshold },
        });
      }
    }
  }
  for (const r of series.readings) {
    if (r.km > p.absoluteMax && !flags.some((f) => f.check === 'implausible_mileage_rate' && f.observationIds.includes(r.obsId))) {
      flags.push({ check: 'implausible_mileage_rate', severity: 'attention', observationIds: [r.obsId], details: { km: r.km } });
    }
  }
  return flags;
}

/** Current mileage: highest reading in the latest segment plus completed earlier segments (estimated). */
export function currentMileage(series: MileageSeries, usable: (obsId: string) => boolean):
  { km: number; estimated: boolean; supporting: string[] } | undefined {
  const rs = series.readings.filter((r) => usable(r.obsId));
  if (!rs.length) return undefined;
  const last = series.segments - 1;
  const lastSeg = rs.filter((r) => r.segment === last);
  if (!series.swaps.length) {
    const top = rs.reduce((a, b) => (b.km > a.km ? b : a));
    return { km: top.km, estimated: false, supporting: [top.obsId] };
  }
  // Distance covered on earlier clusters = sum of (reading_before of swap k − reading_after of swap k−1).
  let earlier = 0;
  let prevAfter = 0;
  for (const s of series.swaps) {
    earlier += s.before - prevAfter;
    prevAfter = s.after;
  }
  const lastTop = lastSeg.length ? lastSeg.reduce((a, b) => (b.km > a.km ? b : a)) : undefined;
  const onCurrent = (lastTop?.km ?? prevAfter) - prevAfter;
  return {
    km: earlier + onCurrent,
    estimated: true,
    supporting: [...series.swaps.map((s) => s.obsId), ...(lastTop ? [lastTop.obsId] : [])],
  };
}
