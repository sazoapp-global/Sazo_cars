// Reports — module 6: exposure-filtered read models (D-025, P-002, P-007, O-001 default "status only").
// The only place that assembles what a user sees, so hiding rules live in exactly one place.
import { Inject, Injectable } from '@nestjs/common';
import { IngestionService } from '../ingest/index.js';
import { ObservationsService, type StoredObservation } from '../obs/index.js';
import { TrustService, type TrustSnapshot } from '../trust/index.js';
import { VehicleRegistry, type VehicleCard } from '../vehicle/index.js';

export type Audience = 'public' | 'consumer';

/** Facts a consumer may see (DM / P-007: no owner identities; O-001: finance & police as status only). */
const CONSUMER_FACTS = new Set([
  'make', 'model', 'year', 'body', 'fuel', 'transmission', 'registered_colour', 'current_colour', 'current_plate', 'previous_plates',
  'registered_engine_number', 'current_engine_number', 'current_mileage_km', 'owner_count', 'usage_type', 'usage_history',
  'finance_status', 'stolen_status', 'impound_status', 'title_status', 'import_origin', 'first_registration_date',
]);
/** Facts safe on the public summary card. */
const PUBLIC_CARD_FACTS = ['make', 'model', 'year'] as const;

export class ReportNotFound extends Error {}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(TrustService) private readonly trust: TrustService,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(IngestionService) private readonly ingestion: IngestionService,
  ) {}

  private async load(ref: string): Promise<{ id: string; card: VehicleCard & Record<string, unknown>; snap: TrustSnapshot }> {
    const id = await this.registry.idForRef(ref);
    if (!id) throw new ReportNotFound(ref);
    const card = await this.registry.card(id);
    const snap = await this.trust.current(id);
    if (!card || !snap) throw new ReportNotFound(ref);
    const enriched: VehicleCard & Record<string, unknown> = { ...card };
    for (const k of PUBLIC_CARD_FACTS) if (snap.facts[k]) enriched[k] = snap.facts[k]!.value;
    const banner = snap.questions.find((q) => q.status === 'serious' && ['identity', 'legal_financial'].includes(q.question));
    if (banner) enriched.banner = { severity: 'serious', headlineKey: banner.headlineKey };
    return { id, card: enriched, snap };
  }

  /** Public summary: one status + one headline per question. No details, figures, sources or valuation (P-002). */
  async publicSummary(ref: string) {
    const { card, snap } = await this.load(ref);
    return {
      vehicle: card,
      questions: snap.questions.map((q) => ({ question: q.question, status: q.status, headlineKey: q.headlineKey })),
      recordConfidence: snap.recordConfidence,
      asOf: snap.asOf,
      signInForDetails: true,
    };
  }

  async fullReport(ref: string) {
    const { card, snap } = await this.load(ref);
    const facts = Object.entries(snap.facts)
      .filter(([k]) => CONSUMER_FACTS.has(k))
      .map(([key, f]) => ({ key, value: f.value, confidence: f.confidence, estimated: f.estimated }));
    const valuation = snap.questions.find((q) => q.question === 'valuation');
    return {
      vehicle: card,
      questions: snap.questions.map((q) => ({ question: q.question, status: q.status, headlineKey: q.headlineKey, params: q.params, notes: q.notes })),
      recordConfidence: snap.recordConfidence,
      health: snap.health ?? { insufficient: true, score: null, band: null, deductions: [] },
      valuation: {
        status: valuation?.status === 'verified' ? 'verified' : valuation?.status === 'attention' ? 'attention' : 'not_available',
        comparablesCount: Number((valuation?.params as { comparables?: number })?.comparables ?? 0),
        isEstimate: true,
      },
      facts,
      openConflicts: snap.openConflicts.map((c) => ({ topic: c.topic, headlineKey: `conflict.${c.topic}.open` })),
      asOf: snap.asOf,
      ruleSetVersion: snap.ruleSetVersion,
    };
  }

  private async sourceLabels(): Promise<Map<string, { label: string; evidenceClass: string; domain: string }>> {
    const sources = await this.ingestion.listSources();
    return new Map(sources.map((s) => [s.id, {
      evidenceClass: s.evidenceClass,
      domain: s.domain,
      label: s.evidenceClass === 'official' ? 'Official record'
        : s.evidenceClass === 'garage' ? `Garage record · ${s.name}`
        : s.evidenceClass === 'inspection' ? `Inspection · ${s.name}`
        : s.evidenceClass === 'owner_provided' ? 'Owner-provided · not yet verified'
        : s.name,
    }]));
  }

  /** Consumer-visible view of an observation, or undefined if it must be hidden entirely. */
  private exposeObservation(o: StoredObservation): Record<string, unknown> | undefined {
    if (o.sensitivity === 'confidential') return undefined; // costs, ownership parties (P-007)
    if (o.sensitivity === 'restricted') return {}; // police/finance/claims: the fact that it exists, not the detail (O-001)
    return o.attributes;
  }

  async timeline(ref: string) {
    const { id, snap } = await this.load(ref);
    const family = await this.registry.mergeFamily(id);
    const [events, obs, labels] = await Promise.all([this.observations.events(family), this.observations.listForVehicles(family), this.sourceLabels()]);
    return {
      items: events.map((e) => {
        const inEvent = obs.filter((o) => o.eventId === e.id);
        const visible = inEvent.filter((o) => o.sensitivity !== 'confidential');
        const reading = inEvent.find((o) => o.type === 'odometer_reading');
        const src = labels.get(e.sourceId);
        return {
          eventId: e.id,
          type: e.type,
          time: { at: e.eventTime, precision: e.precision },
          evidenceClass: src?.evidenceClass,
          sourceLabel: src?.label,
          summaryKey: `timeline.${e.type}`,
          params: { records: [...new Set(visible.map((o) => o.type))] },
          mileageKm: reading && !snap.assessments.get(reading.id)?.excluded ? (reading.attributes.km as number) : null,
          evidenceCount: inEvent.reduce((n, o) => n + o.evidenceKinds.length, 0),
          ownerConfirmation: e.ownerConfirmation,
          flags: [...new Set(snap.flags.filter((f) => f.observationIds.some((x) => inEvent.some((o) => o.id === x))).map((f) => f.check))],
        };
      }).filter((t) => t.params.records.length > 0),
      nextCursor: null,
    };
  }

  /** Evidence ledger: every observation the consumer may see, including excluded ones with the reason. */
  async evidenceLedger(ref: string) {
    const { id, snap } = await this.load(ref);
    const family = await this.registry.mergeFamily(id);
    const [obs, labels] = await Promise.all([this.observations.listForVehicles(family), this.sourceLabels()]);
    const items = [];
    for (const o of obs) {
      const attributes = this.exposeObservation(o);
      if (attributes === undefined) continue;
      const a = snap.assessments.get(o.id);
      const src = labels.get(o.sourceId);
      items.push({
        observationId: o.id,
        eventId: o.eventId,
        type: o.type,
        attributes,
        time: { at: o.eventTime, precision: o.precision },
        recordedAt: o.recordedAt,
        evidenceClass: o.evidenceClass,
        sourceLabel: src?.label,
        confidence: a?.confidence ?? 0,
        confidenceFactors: a?.factors ?? {},
        excluded: a?.excluded ?? false,
        exclusionReason: a?.exclusionReason ?? null,
        evidence: o.evidenceKinds.map((kind) => ({ kind })),
      });
    }
    return { items, nextCursor: null };
  }
}
