// Source reputation (Rule Set §2) and observation confidence (§3).
import { isObservationType, normalizeIdentifier, requiredEvidenceFor } from '@sazo/contracts';
import type { MileageSeries } from './mileage.js';
import { PARAMS } from './params.js';
import { daysBetween } from './time.js';
import type { EngineAttestation, EngineObservation, EngineSource, Flag } from './types.js';
import type { WorkingSet } from './working-set.js';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function reputation(s: EngineSource): number {
  let rep: number = PARAMS.baseline[s.evidenceClass];
  if (s.evidenceClass === 'garage') {
    const g = PARAMS.garageReputation;
    const c = s.attestationStats?.confirmed ?? 0;
    const d = s.attestationStats?.disputed ?? 0;
    const n = c + d + g.smoothing;
    rep = clamp(PARAMS.baseline.garage + (g.confirmWeight * c) / n - (g.disputeWeight * d) / n, g.min, g.max);
  }
  if (s.suspendedAt) rep = Math.min(rep, PARAMS.garageReputation.suspendedCap);
  return round3(rep);
}

function requiredEvidence(o: EngineObservation): string[] {
  return isObservationType(o.type) ? requiredEvidenceFor(o.type, o.attributes) : [];
}

function attestationEffect(o: EngineObservation, atts: EngineAttestation[]): { effect: number; confirmed: boolean; disputed: boolean } {
  let effect = 0;
  let confirmed = false;
  let disputed = false;
  for (const a of atts) {
    if (a.observationId !== o.id && !(a.eventId && a.eventId === o.eventId)) continue;
    if (a.response === 'no_response') continue;
    effect += PARAMS.attestation[a.attesterKind][a.response];
    if (a.response === 'confirmed') confirmed = true;
    else disputed = true;
  }
  return { effect, confirmed, disputed };
}

function corroborations(o: EngineObservation, ws: WorkingSet, series: MileageSeries): number {
  const org = ws.org(o);
  if (!o.eventTime) return 0;
  const others = ws.included.filter((x) => x.id !== o.id && x.eventTime && ws.org(x) !== org);
  const within = (x: EngineObservation) => Math.abs(daysBetween(o.eventTime!, x.eventTime!)) <= PARAMS.corroboration.withinDays;

  if (o.type === 'odometer_reading') {
    const me = series.readings.find((r) => r.obsId === o.id);
    if (!me) return 0;
    return series.readings.filter((r) => {
      if (r.obsId === o.id || r.segment !== me.segment) return false;
      const x = ws.included.find((y) => y.id === r.obsId);
      if (!x || ws.org(x) === org || !within(x)) return false;
      return r.time <= me.time ? r.km <= me.km * 1.02 : r.km >= me.km * 0.98; // consistent order, ±2%
    }).length;
  }
  if (o.type === 'registration_issued' || o.type === 'identifier_assigned') {
    const value = normalizeIdentifier(String(o.attributes.plate ?? o.attributes.value ?? ''));
    return others.filter((x) => normalizeIdentifier(String(x.attributes.plate ?? x.attributes.value ?? '')) === value).length;
  }
  const key = JSON.stringify(o.attributes);
  return others.filter((x) => x.type === o.type && within(x) && JSON.stringify(x.attributes) === key).length;
}

export interface BaseConfidence {
  base: number;
  factors: Record<string, number | string>;
  attestation: { confirmed: boolean; disputed: boolean };
}

/** Confidence before consistency penalties. */
export function baseConfidence(o: EngineObservation, ws: WorkingSet, series: MileageSeries): BaseConfidence {
  const src = ws.source(o);
  const rep = reputation(src);
  const factors: Record<string, number | string> = { source_reputation: rep };
  let c = rep;

  const required = requiredEvidence(o);
  const capture = src.evidenceClass === 'garage' || src.evidenceClass === 'inspection';
  if (required.length && required.every((k) => o.evidenceKinds.includes(k as never))) {
    c += PARAMS.evidenceBonus;
    factors.evidence = PARAMS.evidenceBonus;
  } else if (required.length && capture) {
    c += PARAMS.legacyPenalty;
    factors.missing_required_evidence = PARAMS.legacyPenalty;
  }

  const n = corroborations(o, ws, series);
  if (n) {
    const bonus = Math.min(PARAMS.corroboration.max, n * PARAMS.corroboration.each);
    c += bonus;
    factors.corroboration = round3(bonus);
  }

  const att = attestationEffect(o, ws.input.attestations ?? []);
  if (att.effect) {
    c += att.effect;
    factors.attestation = round3(att.effect);
  }
  return { base: c, factors, attestation: { confirmed: att.confirmed, disputed: att.disputed } };
}

/** Apply the strongest consistency penalty that applies to the observation and clamp. */
export function finalConfidence(o: EngineObservation, base: BaseConfidence, flags: Flag[]): { confidence: number; factors: Record<string, number | string> } {
  const mine = flags.filter((f) => f.observationIds.includes(o.id) && f.severity !== 'info');
  const factors = { ...base.factors };
  let c = base.base;
  if (mine.length) {
    const penalty = mine.some((f) => f.severity === 'serious') ? PARAMS.flagPenalty.serious : PARAMS.flagPenalty.attention;
    c += penalty;
    factors.consistency = penalty;
    factors.flags = mine.map((f) => f.check).join(',');
  }
  return { confidence: round3(clamp(c, PARAMS.confidenceClamp.min, PARAMS.confidenceClamp.max)), factors };
}
