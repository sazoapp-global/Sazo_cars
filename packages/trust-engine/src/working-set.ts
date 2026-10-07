// Phase A of an evaluation: decide which observations count (Rule Set §1) and gather lookups
// that every later phase needs.
import type { EngineContext, EngineObservation, EngineSource, VehicleInput } from './types.js';
import { byEventTime, daysBetween } from './time.js';

export interface WorkingSet {
  input: VehicleInput;
  ctx: EngineContext;
  all: EngineObservation[];
  /** Non-excluded observations in event-time order. */
  included: EngineObservation[];
  exclusions: Map<string, 'retracted' | 'corrected' | 'retired_simulated_source' | 'duplicate'>;
  source: (o: EngineObservation) => EngineSource;
  org: (o: EngineObservation) => string;
}

const stable = (v: unknown): string => JSON.stringify(v, Object.keys((v ?? {}) as object).sort());

export function buildWorkingSet(input: VehicleInput, ctx: EngineContext): WorkingSet {
  const source = (o: EngineObservation): EngineSource => {
    const s = ctx.sources.get(o.sourceId);
    if (!s) throw new Error(`unknown source ${o.sourceId} on observation ${o.id}`);
    return s;
  };
  const exclusions = new Map<string, 'retracted' | 'corrected' | 'retired_simulated_source' | 'duplicate'>();

  // Observations recorded after the as-of time don't exist yet for this evaluation (G4).
  const all = input.observations.filter((o) => Date.parse(o.recordedAt) <= Date.parse(ctx.asOf)).sort(byEventTime);

  for (const o of all) {
    const s = source(o);
    if (s.isSimulated && s.status === 'retired' && s.supersededBySourceId) exclusions.set(o.id, 'retired_simulated_source');
  }
  // A relation only exists once the observation that makes it has been recorded (as-of, G4).
  const known = new Set(all.map((o) => o.id));
  for (const r of (input.relations ?? []).filter((x) => known.has(x.from))) {
    if (r.kind === 'retracts') exclusions.set(r.to, 'retracted');
    if (r.kind === 'corrects') exclusions.set(r.to, 'corrected');
    if (r.kind === 'duplicates') exclusions.set(r.from, 'duplicate');
  }
  // C10: automatic duplicate detection — same source, type, attributes, within 1 day.
  for (let i = 0; i < all.length; i++) {
    const a = all[i]!;
    if (exclusions.has(a.id)) continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j]!;
      if (exclusions.has(b.id) || a.sourceId !== b.sourceId || a.type !== b.type) continue;
      if (!a.eventTime || !b.eventTime || Math.abs(daysBetween(a.eventTime, b.eventTime)) > 1) continue;
      if (stable(a.attributes) === stable(b.attributes)) exclusions.set(b.id, 'duplicate');
    }
  }

  return {
    input,
    ctx,
    all,
    included: all.filter((o) => !exclusions.has(o.id)),
    exclusions,
    source,
    org: (o) => source(o).organisationId,
  };
}
