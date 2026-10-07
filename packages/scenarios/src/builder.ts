// A tiny DSL so each scenario reads like its story in the Scenario Dataset document.
import { isObservationType, requiredEvidenceFor, validateObservation } from '@sazo/contracts';
import type { EvidenceKind, Question, QuestionStatus, RecordConfidenceLevel } from '@sazo/contracts';
import type { EngineAttestation, EngineObservation, EngineRelation, IdentityAlert, VehicleInput } from '@sazo/trust-engine';
import { SOURCES } from './cast.js';

type Sym = '✓' | '!' | '✗' | '–';
const SYM: Record<Sym, QuestionStatus> = { '✓': 'verified', '!': 'attention', '✗': 'serious', '–': 'not_available' };

export interface Expected {
  /** Seven symbols in question order: I C D M P L V, e.g. "✓✓✓✓✓✓✓". */
  questions: Record<Question, QuestionStatus>;
  recordConfidence: RecordConfidenceLevel;
  health?: number | 'insufficient' | { min: number; max: number };
  flags?: string[];
  noFlags?: boolean;
  facts?: Record<string, unknown>;
  headlines?: Partial<Record<Question, string>>;
}

export interface Scenario {
  id: string;
  title: string;
  vehicle: VehicleInput;
  comparablesCount: number;
  expected: Expected;
  sourceOverrides?: Parameters<typeof import('./cast.js').sourceMap>[0];
}

export function q(symbols: string): Record<Question, QuestionStatus> {
  const chars = [...symbols] as Sym[];
  if (chars.length !== 7) throw new Error(`expected 7 question symbols, got "${symbols}"`);
  const order: Question[] = ['identity', 'care', 'damage', 'mileage', 'provenance', 'legal_financial', 'valuation'];
  return Object.fromEntries(order.map((k, i) => [k, SYM[chars[i]!]])) as Record<Question, QuestionStatus>;
}

export class VehicleBuilder {
  private obs: EngineObservation[] = [];
  private rels: EngineRelation[] = [];
  private atts: EngineAttestation[] = [];
  private alerts: IdentityAlert[] = [];
  private seq = 0;
  identifiers: VehicleInput['identifiers'] = [];
  status: VehicleInput['status'] = 'active';

  constructor(readonly vehicleId: string) {}

  /**
   * Add one observation. Garage/inspection observations get their required evidence attached automatically
   * (pass `noEvidence` to simulate a legacy record) and are grouped into one event per source per day.
   */
  add(sourceId: string, date: string, type: string, attributes: Record<string, unknown> = {},
    opts: { noEvidence?: boolean; evidence?: EvidenceKind[]; recordedAt?: string; id?: string; eventId?: string } = {}): string {
    if (!SOURCES[sourceId]) throw new Error(`unknown source ${sourceId}`);
    const v = validateObservation(type, attributes);
    if (!v.ok) throw new Error(`${this.vehicleId}: invalid ${type} ${JSON.stringify(v.errors)}`);
    const cls = SOURCES[sourceId]!.evidenceClass;
    const capture = cls === 'garage' || cls === 'inspection';
    const evidence = opts.evidence ?? (capture && !opts.noEvidence && isObservationType(type) ? requiredEvidenceFor(type, attributes) : []);
    const id = opts.id ?? `${this.vehicleId}-o${++this.seq}`;
    const grouped = capture || SOURCES[sourceId]!.domain === 'rental' || sourceId === 'INS-N';
    this.obs.push({
      id,
      type,
      attributes: v.attributes,
      eventTime: `${date}T09:00:00Z`,
      precision: 'day',
      recordedAt: opts.recordedAt ?? `${date}T12:00:00Z`,
      sourceId,
      eventId: opts.eventId ?? (grouped ? `${this.vehicleId}-${sourceId}-${date}` : undefined),
      evidenceKinds: evidence,
    });
    return id;
  }

  /** Baseline (Scenario Dataset §1): official import + registration + spec. */
  baseline(importDate: string, regDate: string, plate: string, spec: Record<string, unknown>, origin = 'JP'): this {
    this.add('CUS', importDate, 'import_recorded', { originCountry: origin, port: 'Mombasa' });
    this.add('REG', regDate, 'registration_issued', { plate });
    this.add('REG', regDate, 'spec_declared', spec);
    return this;
  }

  /** A garage job: odometer reading plus a service, as one visit. */
  service(garage: string, date: string, km: number, extra: { noEvidence?: boolean } = {}): this {
    this.add(garage, date, 'odometer_reading', { km, originalValue: km, originalUnit: 'km' }, extra);
    this.add(garage, date, 'service_performed', { items: ['engine_oil', 'oil_filter'] });
    return this;
  }

  ident(type: VehicleInput['identifiers'][number]['type'], value: string): this {
    this.identifiers.push({ type, value });
    return this;
  }

  relate(from: string, to: string, kind: EngineRelation['kind']): this {
    this.rels.push({ from, to, kind });
    return this;
  }

  attest(eventIdOrObs: string, response: EngineAttestation['response'], attesterKind: EngineAttestation['attesterKind'] = 'registered_owner'): this {
    const isEvent = this.obs.some((o) => o.eventId === eventIdOrObs);
    this.atts.push(isEvent ? { eventId: eventIdOrObs, response, attesterKind } : { observationId: eventIdOrObs, response, attesterKind });
    return this;
  }

  /** Confirm every garage visit (owner confirmed by SMS). */
  confirmAllGarageVisits(): this {
    const events = new Set(this.obs.filter((o) => SOURCES[o.sourceId]!.domain === 'garage').map((o) => o.eventId!));
    for (const e of events) this.attest(e, 'confirmed');
    return this;
  }

  alert(a: IdentityAlert): this {
    this.alerts.push(a);
    return this;
  }

  eventOf(obsId: string): string {
    const o = this.obs.find((x) => x.id === obsId);
    if (!o?.eventId) throw new Error(`no event for ${obsId}`);
    return o.eventId;
  }

  build(): VehicleInput {
    return {
      vehicleId: this.vehicleId,
      status: this.status,
      identifiers: this.identifiers,
      observations: this.obs,
      relations: this.rels,
      attestations: this.atts,
      identityAlerts: this.alerts,
    };
  }
}
