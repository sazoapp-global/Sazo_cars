// Garage workspace — module 7 (D-050…D-059). A garage finds the car by plate, records the job in short
// steps (drafts are saved as they go, offline-safe), and submits it. A submitted job becomes an Ingestion
// submission on the garage's own source (channel garage_app), and the customer gets an SMS to confirm.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { classifyIdentifier, normalizeIdentifier } from '@sazo/contracts';
import { PARAMS } from '@sazo/trust-engine';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { IamService, type Actor } from '../iam/index.js';
import { IngestionError, IngestionService } from '../ingest/index.js';
import { NotificationsService } from '../notify/index.js';
import { AttestationsService, EvidenceService, maskPhone, ObservationsService, PartiesService } from '../obs/index.js';
import { TrustService } from '../trust/index.js';
import { VehicleRegistry, type VehicleCard } from '../vehicle/index.js';
import { GarageRepository, type JobRow, type JobStatus } from './garage.repository.js';
import { completenessErrors, evidenceRefs, jobRecords, workPhrase, type DraftInput, type FieldError } from './job-form.js';

export interface CheckWarning {
  code: 'mileage_lower_than_last' | 'plate_vin_mismatch' | 'undeclared_engine_change' | 'implausible_mileage_rate' | 'date_impossible';
  severity: 'attention' | 'serious';
  messageKey: string;
  params: Record<string, unknown>;
  blocking: boolean;
}

export class GarageError extends Error {
  constructor(
    readonly code: 'job_not_found' | 'version_conflict' | 'job_not_editable' | 'job_already_submitted' | 'vehicle_not_found' | 'job_incomplete'
      | 'evidence_invalid' | 'plate_photo_required' | 'warnings_need_acknowledgement' | 'blocked' | 'organisation_not_approved' | 'invalid_plate',
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

/** What the garage sees about the car in the bay — enough to record well, nothing about other garages (D-053). */
export interface LookupCandidate extends VehicleCard {
  make?: string; model?: string; year?: number; colour?: string; chassisLast4?: string; expectedEngineNumber?: string;
  lastMileage?: { km: number; on: string };
}

const sourceCodeFor = (organisationId: string) => `GAR-${organisationId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
const DAY = 86_400_000;

@Injectable()
export class GarageService {
  private readonly log = new Logger('Garage');

  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(GarageRepository) private readonly repo: GarageRepository,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(TrustService) private readonly trust: TrustService,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(PartiesService) private readonly parties: PartiesService,
    @Inject(AttestationsService) private readonly attestations: AttestationsService,
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ lookup

  private async candidate(card: VehicleCard): Promise<LookupCandidate> {
    const id = (await this.registry.idForRef(card.vehicleRef))!;
    const [snap, idents, family] = await Promise.all([this.trust.current(id), this.registry.identifiers(id), this.registry.mergeFamily(id)]);
    const fact = (k: string) => snap?.facts[k]?.value;
    const anchor = idents.find((i) => (i.type === 'vin' || i.type === 'chassis_number') && i.status === 'active');
    const last = await this.lastReading(family, snap?.assessments);
    return {
      ...card,
      ...(fact('make') ? { make: String(fact('make')) } : {}),
      ...(fact('model') ? { model: String(fact('model')) } : {}),
      ...(fact('year') ? { year: Number(fact('year')) } : {}),
      ...(fact('current_colour') ? { colour: String(fact('current_colour')) } : {}),
      ...(anchor ? { chassisLast4: anchor.valueRaw.slice(-4) } : {}),
      ...(fact('current_engine_number') ? { expectedEngineNumber: String(fact('current_engine_number')) } : {}),
      ...(last ? { lastMileage: last } : {}),
    };
  }

  /** The latest odometer reading SAZO trusts (excluded/corrected readings are skipped). */
  private async lastReading(family: string[], assessments?: Map<string, { excluded: boolean }>): Promise<{ km: number; on: string } | undefined> {
    const readings = (await this.observations.listForVehicles(family))
      .filter((o) => o.type === 'odometer_reading' && o.eventTime && !assessments?.get(o.id)?.excluded)
      .sort((a, b) => a.eventTime!.localeCompare(b.eventTime!));
    const r = readings.at(-1);
    return r ? { km: Number(r.attributes.km), on: r.eventTime!.slice(0, 10) } : undefined;
  }

  async lookup(plate: string): Promise<{ outcome: 'found' | 'multiple' | 'not_found'; candidates: LookupCandidate[]; newVehicleRequires?: string[] }> {
    if (classifyIdentifier(plate).kind !== 'plate') throw new GarageError('invalid_plate', 'That does not look like a number plate');
    const s = await this.registry.search(plate);
    const candidates = await Promise.all(s.matches.map((m) => this.candidate(m)));
    if (!candidates.length) return { outcome: 'not_found', candidates: [], newVehicleRequires: ['plate_photo'] };
    return { outcome: candidates.length === 1 ? 'found' : 'multiple', candidates };
  }

  // ------------------------------------------------------------------ drafts

  /** Create or update a draft (PUT with a phone-generated id, DM-16). Customer details go to the personal-data store. */
  async saveDraft(actor: Actor, organisationId: string, jobId: string, d: DraftInput): Promise<JobRow> {
    const existing = await this.repo.job(jobId);
    if (existing && existing.organisationId !== organisationId) throw new GarageError('job_not_found', 'No such job');
    if (existing && existing.status !== 'draft') throw new GarageError('job_not_editable', 'This job has been submitted and can no longer be changed');
    if (existing && d.version !== undefined && d.version !== existing.version) {
      throw new GarageError('version_conflict', 'This job was changed on another device; reload it first');
    }
    let vehicleId: string | null = null;
    if (d.vehicleRef) {
      vehicleId = (await this.registry.idForRef(d.vehicleRef)) ?? null;
      if (!vehicleId) throw new GarageError('vehicle_not_found', 'No such vehicle');
    }
    const { customer, ...form } = d.form;

    await withTx(this.pool, async (tx) => {
      const row = { id: jobId, plateEntered: d.plateEntered, vehicleId, workTypes: d.workTypes, form, clientCreatedAt: d.clientCreatedAt };
      if (!existing) {
        await this.repo.insertDraft(tx, { ...row, organisationId, createdBy: actor.userId });
      } else if (!(await this.repo.updateDraft(tx, { ...row, expectedVersion: d.version }))) {
        throw new GarageError('version_conflict', 'This job was changed on another device; reload it first');
      }
      if (customer && (customer.name || customer.phone)) {
        const partyId = await this.parties.upsertPerson({ name: customer.name, phone: customer.phone }, tx);
        const consent = !!customer.phone && !!customer.smsConsent;
        if (consent) await this.parties.recordConsent(partyId, 'attestation_sms', 'garage_app', tx);
        await this.repo.setCustomer(tx, jobId, { partyId, phoneProvided: !!customer.phone, smsConsent: consent });
      } else if (customer === undefined && !existing) {
        await this.repo.setCustomer(tx, jobId, null);
      }
    }).catch((err: { code?: string; constraint?: string }) => {
      // The same new id saved twice at once: the second insert loses — treat it as a version conflict.
      if (err.code === '23505' && !existing) throw new GarageError('version_conflict', 'This job was just saved from another device; reload it');
      throw err;
    });
    return (await this.repo.job(jobId))!;
  }

  async job(organisationId: string, jobId: string): Promise<JobRow> {
    const j = await this.repo.job(jobId);
    if (!j || j.organisationId !== organisationId) throw new GarageError('job_not_found', 'No such job');
    return j;
  }

  list(organisationId: string, status: JobStatus | undefined, limit: number): Promise<JobRow[]> {
    return this.repo.list(organisationId, status, limit);
  }

  /** The API view of a job: vehicle by public reference, the entering staff member's name, customer masked. */
  async view(j: JobRow) {
    const [names, vehicle, customer, ownerConfirmation] = await Promise.all([
      this.iam.displayNames([j.createdBy]),
      j.vehicleId ? this.registry.getVehicle(j.vehicleId) : undefined,
      j.partyId ? this.parties.reveal(j.partyId) : undefined,
      this.ownerConfirmation(j),
    ]);
    return {
      jobId: j.id,
      publicRef: j.publicRef,
      status: j.status,
      plateEntered: j.plateEntered,
      ...(vehicle ? { vehicleRef: vehicle.publicRef } : {}),
      workTypes: j.workTypes,
      form: {
        ...j.form,
        ...(customer ? { customer: { ...(customer.name ? { name: customer.name } : {}), ...(customer.phone ? { phoneMasked: maskPhone(customer.phone) } : {}), smsConsent: j.smsConsent } } : {}),
      },
      createdBy: { userId: j.createdBy, displayName: names.get(j.createdBy) ?? '' },
      clientCreatedAt: j.clientCreatedAt,
      submittedAt: j.submittedAt,
      submissionId: j.submissionId,
      ownerConfirmation,
      acknowledgedWarnings: j.acknowledgedWarnings,
      rejectionReason: j.rejectionReason,
      version: j.version,
    };
  }

  private async ownerConfirmation(j: JobRow): Promise<'confirmed' | 'disputed' | 'pending' | 'not_requested'> {
    if (!j.attestationRequestId) return 'not_requested';
    return (await this.attestations.byId(j.attestationRequestId))?.answer ?? 'pending';
  }

  // ------------------------------------------------------------------ submit

  /** Consistency checks (D-059): warn, don't block — except for impossible dates. */
  private async checks(j: JobRow, vehicleId: string | null, plateCandidates: number): Promise<CheckWarning[]> {
    const w: CheckWarning[] = [];
    const at = new Date(j.clientCreatedAt).getTime();
    if (at > Date.now() + 10 * 60_000) {
      w.push({ code: 'date_impossible', severity: 'serious', messageKey: 'garage.check.date_in_future', params: { date: j.clientCreatedAt }, blocking: true });
    }
    if (plateCandidates > 1) {
      w.push({ code: 'plate_vin_mismatch', severity: 'serious', messageKey: 'garage.check.plate_on_several_vehicles', params: { plate: j.plateEntered, vehicles: plateCandidates }, blocking: false });
    }
    if (!vehicleId) return w;

    const snap = await this.trust.current(vehicleId);
    const last = await this.lastReading(await this.registry.mergeFamily(vehicleId), snap?.assessments);
    const m = j.form.mileage!;
    const km = m.unit === 'mi' ? Math.round(m.value * 1.609344) : m.value;
    if (last) {
      if (km < last.km * (1 - PARAMS.mileage.decreaseTolerance)) {
        w.push({ code: 'mileage_lower_than_last', severity: 'serious', messageKey: 'garage.check.mileage_lower_than_last', params: { lastKm: last.km, lastOn: last.on, enteredKm: km }, blocking: false });
      } else {
        const days = (at - new Date(last.on).getTime()) / DAY;
        const usage = String(snap?.facts.usage_type?.value ?? 'private') as keyof typeof PARAMS.mileage.annualThreshold;
        const limit = PARAMS.mileage.annualThreshold[usage] ?? PARAMS.mileage.annualThreshold.private;
        const perYear = ((km - last.km) / Math.max(days, 1)) * 365;
        if (days >= PARAMS.mileage.minDaysBetweenForRate && perYear > limit) {
          w.push({ code: 'implausible_mileage_rate', severity: 'attention', messageKey: 'garage.check.implausible_mileage_rate', params: { kmPerYear: Math.round(perYear), limit }, blocking: false });
        }
      }
    }
    const expected = snap?.facts.current_engine_number?.value;
    const old = j.form.engine?.replaced ? j.form.engine.oldEngineNumber : undefined;
    if (expected && old && normalizeIdentifier(old) !== normalizeIdentifier(String(expected))) {
      w.push({ code: 'undeclared_engine_change', severity: 'attention', messageKey: 'garage.check.old_engine_differs_from_record', params: { expected, entered: old }, blocking: false });
    }
    return w;
  }

  /** Evidence must exist, be of the right kind, and come from someone in this garage. */
  private async evidenceErrors(j: JobRow): Promise<FieldError[]> {
    const refs = evidenceRefs(j.form);
    const files = new Map((await this.evidence.view(refs.map((r) => r.id))).map((f) => [f.evidenceId, f]));
    const errors: FieldError[] = [];
    for (const r of refs) {
      const f = files.get(r.id);
      if (!f || !f.uploadedBy || !(await this.iam.isActiveMember(f.uploadedBy, j.organisationId))) {
        errors.push({ path: r.path, code: 'evidence_not_found', message: 'Photo not found — upload it again' });
      } else if (r.kind && f.kind !== r.kind) {
        errors.push({ path: r.path, code: 'evidence_wrong_kind', message: `This should be a ${r.kind.replace(/_/g, ' ')}` });
      }
    }
    return errors;
  }

  private async ensureSource(organisationId: string): Promise<string> {
    const code = sourceCodeFor(organisationId);
    if (!(await this.ingestion.sourceByCode(code))) {
      const org = await this.iam.organisation(organisationId);
      await this.ingestion.upsertSource({
        code, name: org?.tradingName ?? org?.legalName ?? code, organisationId, domain: 'garage', channel: 'garage_app', isSimulated: false,
        evidenceClass: 'garage', baselineReputation: PARAMS.baseline.garage, coverage: [{ scope: 'own_customers', from: new Date().toISOString().slice(0, 10) }],
      });
    }
    return code;
  }

  async submit(actor: Actor, organisationId: string, jobId: string, idempotencyKey: string, acknowledged: { code: string; explanation: string }[]) {
    const j = await this.job(organisationId, jobId);
    if (j.status !== 'draft') {
      // A replay of the same submit (flaky network) gets the same answer; anything else is a conflict.
      if (j.submitKey === idempotencyKey && j.submissionId) return this.submitResult(j, j.acknowledgedWarnings as never);
      throw new GarageError('job_already_submitted', 'This job has already been submitted');
    }

    const incomplete = completenessErrors(j.workTypes, j.form);
    if (incomplete.length) throw new GarageError('job_incomplete', 'Some steps are not finished', incomplete);
    const badEvidence = await this.evidenceErrors(j);
    if (badEvidence.length) throw new GarageError('evidence_invalid', 'Some photos are missing or wrong', badEvidence);

    // Which vehicle? The one picked at lookup; otherwise look the plate up now.
    let vehicleId = j.vehicleId;
    let plateCandidates = 1;
    if (!vehicleId) {
      const found = await this.lookup(j.plateEntered);
      plateCandidates = found.candidates.length;
      if (found.outcome === 'found') vehicleId = (await this.registry.idForRef(found.candidates[0]!.vehicleRef)) ?? null;
      if (found.outcome === 'not_found') {
        const kinds = new Set((await this.evidence.view(j.form.evidenceIds ?? [])).map((f) => f.kind));
        if (!kinds.has('plate_photo')) throw new GarageError('plate_photo_required', 'This car is new to SAZO — take a photo of its number plate', [{ path: 'form.evidenceIds', code: 'evidence_required', message: 'plate photo' }]);
      }
    }

    const warnings = await this.checks(j, vehicleId, plateCandidates);
    const blocking = warnings.filter((w) => w.blocking);
    if (blocking.length) throw new GarageError('blocked', 'This job cannot be submitted as it is', blocking);
    const acks = new Map(acknowledged.map((a) => [a.code, a.explanation]));
    const unacknowledged = warnings.filter((w) => !acks.get(w.code)?.trim());
    if (unacknowledged.length) {
      throw new GarageError('warnings_need_acknowledgement', 'Please check these before submitting; explain to continue', unacknowledged);
    }
    const accepted = warnings.map((w) => ({ code: w.code, explanation: acks.get(w.code)! }));

    if (!(await this.repo.claimForSubmit(j.id, idempotencyKey, accepted))) throw new GarageError('job_already_submitted', 'This job has already been submitted');
    try {
      const sourceCode = await this.ensureSource(organisationId);
      const identifiers = await this.identifiersFor(vehicleId, j.plateEntered);
      const photos = (j.form.evidenceIds ?? []);
      const result = await this.ingestion.submit(sourceCode, {
        schemaVersion: 1,
        items: [{ identifiers, records: jobRecords(j.workTypes, j.form, j.clientCreatedAt, photos) }],
      }, { idempotencyKey, userId: actor.userId, organisationId });
      const item = result.items[0]!;
      const status: JobStatus = item.status === 'accepted' ? 'accepted' : item.status === 'rejected' ? 'rejected' : 'submitted';
      await this.repo.recordOutcome(j.id, {
        submissionId: result.submissionId, status, vehicleId: item.vehicleId ?? null,
        rejectionReason: status === 'rejected' ? item.errors.map((e) => e.message).join('; ') || 'rejected' : null,
      });
      if (status === 'accepted' && item.observationIds?.length) await this.requestOwnerConfirmation(j, item.observationIds[0]!);
    } catch (err) {
      await this.repo.releaseClaim(j.id);
      if (err instanceof IngestionError && err.code === 'organisation_not_approved') throw new GarageError('organisation_not_approved', err.message);
      throw err;
    }
    return this.submitResult((await this.repo.job(j.id))!, accepted);
  }

  private async submitResult(j: JobRow, warnings: { code: string; explanation: string }[]) {
    const vehicle = j.vehicleId ? await this.registry.getVehicle(j.vehicleId) : undefined;
    return {
      jobId: j.id,
      submissionId: j.submissionId!,
      status: 'submitted' as const,
      jobStatus: j.status,
      ...(vehicle ? { vehicleRef: vehicle.publicRef } : {}),
      acknowledgedWarnings: warnings,
      ownerConfirmation: await this.ownerConfirmation(j),
      ...(j.rejectionReason ? { rejectionReason: j.rejectionReason } : {}),
    };
  }

  /** Identify the car to Ingestion by its anchor (VIN/chassis) when known, plus the plate the garage saw. */
  private async identifiersFor(vehicleId: string | null, plate: string): Promise<{ vin?: string; chassisNumber?: string; plate: string }> {
    if (!vehicleId) return { plate };
    const idents = await this.registry.identifiers(vehicleId);
    const vin = idents.find((i) => i.type === 'vin' && i.status === 'active');
    const chassis = idents.find((i) => i.type === 'chassis_number' && i.status === 'active');
    return { ...(vin ? { vin: vin.valueRaw } : chassis ? { chassisNumber: chassis.valueRaw } : {}), plate };
  }

  /** D-058: SMS the customer a confirm/dispute link — only with a phone number and their consent. */
  private async requestOwnerConfirmation(j: JobRow, observationId: string): Promise<void> {
    if (!j.partyId || !j.smsConsent || !(await this.parties.hasConsent(j.partyId, 'attestation_sms'))) return;
    const person = await this.parties.reveal(j.partyId);
    const eventId = await this.attestations.eventOf(observationId);
    if (!person?.phone || !eventId) return;
    const req = await this.attestations.createRequest({ eventId, partyId: j.partyId, channel: 'sms_link' });
    await this.repo.setAttestationRequest(j.id, req.requestId);
    const org = await this.iam.organisation(j.organisationId);
    const m = j.form.mileage!;
    const km = m.unit === 'mi' ? Math.round(m.value * 1.609344) : m.value;
    const sent = await this.notify.sendSmsToPhone(person.phone, 'attestation', {
      garage: org?.tradingName ?? org?.legalName ?? 'A garage', work: workPhrase(j.workTypes), plate: j.plateEntered.toUpperCase(),
      km: km.toLocaleString('en-UG'), date: j.clientCreatedAt.slice(0, 10), link: `${this.cfg.PUBLIC_WEB_URL}/a/${req.token}`,
    }, 'attestation', null, { toPartyId: j.partyId, relatedType: 'attestation_request', relatedId: req.requestId });
    if (!sent) this.log.warn(`owner confirmation SMS for job ${j.publicRef} was not sent`);
  }

  // ------------------------------------------------------------------ owner confirmation page

  /** What the customer is asked to confirm: garage, date, plate, work, mileage — no costs, no other people (P-007). */
  async attestationView(token: string) {
    const req = await this.attestations.byToken(token);
    if (!req) return undefined;
    const j = await this.repo.jobByAttestationRequest(req.requestId);
    if (!j) return undefined;
    const org = await this.iam.organisation(j.organisationId);
    const m = j.form.mileage;
    return {
      request: req,
      view: {
        garageName: org?.tradingName ?? org?.legalName ?? '',
        eventDate: j.clientCreatedAt.slice(0, 10),
        plate: j.plateEntered.toUpperCase(),
        workSummaryKey: 'attest.work_summary',
        params: { workTypes: j.workTypes },
        mileageKm: m ? (m.unit === 'mi' ? Math.round(m.value * 1.609344) : m.value) : null,
        expiresAt: req.expiresAt,
        answered: req.answer,
      },
    };
  }
}
