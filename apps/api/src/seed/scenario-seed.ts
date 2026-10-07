// Loads the Scenario Dataset through the REAL pipeline (Ingestion → Registry → Observations → Trust),
// in the order the data would actually arrive. Dev/demo/test tooling — never run against production.
import { createHash } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { isObservationType, requiredEvidenceFor, type EvidenceKind } from '@sazo/contracts';
import { SCENARIOS, SOURCES, type Scenario } from '@sazo/scenarios';
import type { EngineObservation } from '@sazo/trust-engine';
import pg from 'pg';
import { EventBus } from '../platform/event-bus.js';
import { DB_POOL } from '../platform/tokens.js';
import { IngestionService, type SubmissionItemInput } from '../modules/ingest/index.js';
import { ObservationsService } from '../modules/obs/index.js';
import { ReferenceService } from '../modules/ref/index.js';
import { TrustService } from '../modules/trust/index.js';

const CHANNEL: Record<string, string> = { garage: 'garage_app', inspection: 'inspector_app', owner: 'user_submission' };
/** S08b: the Kireka garage recorded the Harrier under the cloned plate UAX 123A. */
const PRESENTED_PLATE: Record<string, Record<string, string>> = { S08b: { 'GAR-KIR': 'UAX 123A' } };
/** Scenarios not loaded into the shared database (S24-pre is S24's "before" state). */
const SKIP = new Set(['S24-pre']);

export interface SeededVehicle { scenarioId: string; vehicleId: string; vehicleRef: string }

export async function seedScenarios(app: INestApplicationContext, opts: { log?: (m: string) => void } = {}): Promise<SeededVehicle[]> {
  const log = opts.log ?? (() => undefined);
  const pool = app.get<pg.Pool>(DB_POOL);
  const ingestion = app.get(IngestionService);
  const observations = app.get(ObservationsService);
  const reference = app.get(ReferenceService);
  const trust = app.get(TrustService);
  const bus = app.get(EventBus);

  // 1. Organisations and sources (the cast).
  const sourceIds = new Map<string, string>();
  for (const s of Object.values(SOURCES)) {
    const org = await pool.query<{ id: string }>(
      `INSERT INTO iam.organisations (type, legal_name, status, approved_at)
       VALUES ($1, $2, 'approved', now()) RETURNING id`,
      [orgType(s.domain), s.id === 'OWN' ? 'Owner submissions' : `${s.id} (${s.isSimulated ? 'simulated' : 'fictional'})`],
    );
    const id = await ingestion.upsertSource({
      code: s.id, name: sourceName(s.id), organisationId: org.rows[0]!.id, domain: s.domain,
      channel: CHANNEL[s.domain] ?? 'simulated_feed', isSimulated: s.isSimulated, evidenceClass: s.evidenceClass,
      baselineReputation: s.evidenceClass === 'garage' ? 0.7 : s.evidenceClass === 'official' ? 0.9 : s.evidenceClass === 'inspection' ? 0.85 : 0.35,
      coverage: s.coverage.map((c) => ({ scope: c.scope, from: c.from })),
    });
    sourceIds.set(s.id, id);
  }

  const seeded: SeededVehicle[] = [];
  for (const sc of SCENARIOS) {
    if (SKIP.has(sc.id)) continue;
    await seedComparables(reference, sc);
    const vehicleId = await seedVehicle(sc, { ingestion, observations, bus, sourceIds });
    seeded.push({ scenarioId: sc.id, vehicleId, vehicleRef: '' });
    log(`seeded ${sc.id}`);
  }

  // Garage reputations depend on attestations across ALL vehicles: recompute everyone once at the end.
  for (const s of seeded) await trust.recompute(s.vehicleId, 'full_rebuild');
  for (const s of seeded) {
    const { rows } = await pool.query<{ public_ref: string }>('SELECT public_ref FROM vehicle.vehicles WHERE id = $1', [s.vehicleId]);
    s.vehicleRef = rows[0]!.public_ref;
  }
  return seeded;
}

function orgType(domain: string): string {
  return ({ registration: 'registry', customs: 'revenue_authority', police: 'police', finance: 'lender', insurance: 'insurer',
    auction: 'auction', inspection: 'inspection_centre', rental: 'rental', dealer: 'dealer', garage: 'garage', owner: 'sazo' } as Record<string, string>)[domain] ?? 'sazo';
}

function sourceName(code: string): string {
  return ({
    REG: 'Vehicle registry (simulated)', CUS: 'Customs (simulated)', POL: 'Police vehicle records (simulated)',
    LIEN: 'Security-interest registry (simulated)', 'INS-N': 'Nile Assurance (fictional, simulated)', AUC: 'JP export auction (simulated)',
    INSP: 'Kampala Vehicle Inspection Centre (fictional)', RENT: 'Kampala Car Hire (fictional, simulated)', DLR: 'Ntinda Motors (fictional)',
    'GAR-NSA': 'Nsambya Auto Care', 'GAR-MUT': 'Mutungo Auto Works', 'GAR-BWE': 'Bweyogerere Motor Clinic', 'GAR-KIR': 'Kireka Quick Service',
    OWN: 'Owner submissions',
  } as Record<string, string>)[code] ?? code;
}

async function seedComparables(reference: ReferenceService, sc: Scenario): Promise<void> {
  const spec = sc.vehicle.observations.find((o) => o.type === 'spec_declared' && SOURCES[o.sourceId]?.evidenceClass === 'official')
    ?? sc.vehicle.observations.find((o) => o.type === 'spec_declared');
  const a = spec?.attributes as { make?: string; model?: string; year?: number } | undefined;
  if (!a?.make || !a.model || !a.year || !sc.comparablesCount) return;
  const modelId = await reference.ensureModel(a.make, a.model, 'all', 1990);
  const soldOn = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  // Only top up to the scenario's count so shared models don't double up.
  const have = await reference.comparablesCount(a.make, a.model, a.year, new Date().toISOString());
  if (have < sc.comparablesCount) await reference.addSimulatedComparables(modelId, a.year, sc.comparablesCount - have, 60_000_000, soldOn);
}

async function seedVehicle(sc: Scenario, deps: {
  ingestion: IngestionService; observations: ObservationsService; bus: EventBus; sourceIds: Map<string, string>;
}): Promise<string> {
  const v = sc.vehicle;
  const anchor = v.identifiers.find((i) => i.type === 'vin' || i.type === 'chassis_number');
  const builderToDb = new Map<string, string>();
  let vehicleId: string | undefined;

  // Arrival order: by recordedAt (owners report before official records arrive in S24), then event time.
  const ordered = [...v.observations].sort((a, b) => {
    const ownA = a.sourceId === 'OWN' ? 0 : 1;
    const ownB = b.sourceId === 'OWN' ? 0 : 1;
    return ownA - ownB || a.recordedAt.localeCompare(b.recordedAt) || (a.eventTime ?? '').localeCompare(b.eventTime ?? '');
  });

  // Batch consecutive records from the same source on the same day into one submission item.
  const batches: EngineObservation[][] = [];
  for (const o of ordered) {
    const last = batches.at(-1);
    if (last && last[0]!.sourceId === o.sourceId && last[0]!.eventTime?.slice(0, 10) === o.eventTime?.slice(0, 10) && last[0]!.recordedAt === o.recordedAt) last.push(o);
    else batches.push([o]);
  }

  for (const [bi, batch] of batches.entries()) {
    const sourceCode = batch[0]!.sourceId;
    const isOwner = SOURCES[sourceCode]!.domain === 'owner';
    const reg = batch.find((o) => o.type === 'registration_issued');
    const plate = PRESENTED_PLATE[sc.id]?.[sourceCode] ?? (reg?.attributes.plate as string | undefined)
      ?? (isOwner ? v.identifiers.find((i) => i.type === 'registration_plate')?.value : undefined);
    const identifiers: SubmissionItemInput['identifiers'] = {};
    if (anchor && !isOwner) identifiers[anchor.type === 'vin' ? 'vin' : 'chassisNumber'] = anchor.value;
    if (plate) identifiers.plate = plate;

    let legacy = false;
    const records = [];
    for (const o of batch) {
      const evidenceIds = [];
      for (const kind of o.evidenceKinds) evidenceIds.push(await fakeEvidence(deps.observations, sc.id, o.id, kind));
      const required = isObservationType(o.type) ? requiredEvidenceFor(o.type, o.attributes) : [];
      if (required.some((k) => !o.evidenceKinds.includes(k))) legacy = true;
      records.push({ type: o.type, attributes: o.attributes, time: { at: o.eventTime, precision: o.precision }, evidenceIds });
    }

    const result = await deps.ingestion.submit(sourceCode, { schemaVersion: 1, items: [{ identifiers, records }] },
      { idempotencyKey: `seed-${sc.id}-${bi}`, legacyImport: legacy });
    let item = result.items[0]!;
    if (item.status === 'needs_review') {
      // S24: the reviewer matches the official record to the owner's provisional vehicle.
      const queue = await deps.ingestion.itemsNeedingReview();
      const waiting = queue.find((q) => q.submissionId === result.submissionId)!;
      const decided = await deps.ingestion.resolveAmbiguousItem(waiting.itemId, { vehicleId: waiting.candidates[0]! }, '00000000-0000-7000-8000-00000000a0a0');
      item = decided.items[0]!;
    }
    if (item.status !== 'accepted') throw new Error(`${sc.id}: ${sourceCode} item ${item.status} ${JSON.stringify(item.errors)}`);
    vehicleId = item.vehicleId!;
    batch.forEach((o, i) => builderToDb.set(o.id, item.observationIds![i]!));
  }

  // Corrections and other relations.
  for (const r of v.relations ?? []) {
    await deps.bus.transaction((tx, emit) => deps.observations.addRelation(emit, tx, { from: builderToDb.get(r.from)!, to: builderToDb.get(r.to)!, kind: r.kind, reason: 'seed' }));
  }
  // Owner / customer confirmations: builder event keys are "<scenario>-<SOURCE>-<yyyy-mm-dd>".
  for (const a of v.attestations ?? []) {
    if (!a.eventId || a.response === 'no_response') continue;
    const day = a.eventId.slice(-10);
    const sourceCode = a.eventId.slice(sc.vehicle.vehicleId.length + 1, -11);
    const eventId = await deps.observations.findEvent(vehicleId!, deps.sourceIds.get(sourceCode)!, day);
    if (!eventId) throw new Error(`${sc.id}: no event for ${a.eventId}`);
    await deps.bus.transaction((tx, emit) => deps.observations.recordAttestation(emit, tx, {
      eventId, attesterKind: a.attesterKind, response: a.response as 'confirmed' | 'disputed', channel: 'sms_reply',
    }));
  }
  return vehicleId!;
}

async function fakeEvidence(observations: ObservationsService, scenarioId: string, obsId: string, kind: EvidenceKind): Promise<string> {
  const key = `seed/${scenarioId}/${obsId}-${kind}.jpg`;
  return observations.registerEvidence({
    storageKey: `${key}#${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sha256: createHash('sha256').update(key).digest('hex'),
    mimeType: 'image/jpeg',
    sizeBytes: 150_000,
    kind,
  });
}
