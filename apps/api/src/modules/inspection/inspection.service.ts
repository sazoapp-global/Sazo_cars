// Inspector workspace (P-004, P-005). An inspector or inspection centre finds the car by plate, fills in the
// checklist on the phone (drafts saved as they go, offline-safe), and sends it. SAZO then writes the checklist
// into a fingerprinted report file, and the inspection becomes an Ingestion submission on the organisation's
// own source (channel inspector_app, evidence class "inspection").
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { classifyIdentifier, normalizeIdentifier, PANEL_LABELS, type Panel } from '@sazo/contracts';
import { PARAMS } from '@sazo/trust-engine';
import { GarageService, type LookupCandidate } from '../garage/index.js';
import { IamService, type Actor } from '../iam/index.js';
import { IngestionError, IngestionService } from '../ingest/index.js';
import { EvidenceService } from '../obs/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { InspectionRepository, type InspectionRow, type InspectionStatus } from './inspection.repository.js';
import { inspectionErrors, inspectionEvidenceRefs, inspectionRecords, kmOf, repaintedPanels, type InspectionDraftInput, type InspectionFieldError } from './inspection-records.js';

export interface InspectionWarning {
  code: 'date_impossible' | 'plate_on_several_vehicles' | 'mileage_lower_than_last' | 'chassis_differs' | 'engine_number_differs' | 'colour_differs';
  severity: 'attention' | 'serious';
  message: string;
  blocking: boolean;
}

export class InspectionError extends Error {
  constructor(
    readonly code: 'inspection_not_found' | 'version_conflict' | 'not_editable' | 'already_submitted' | 'vehicle_not_found' | 'incomplete'
      | 'evidence_invalid' | 'chassis_required' | 'warnings_need_acknowledgement' | 'blocked' | 'organisation_not_approved',
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

const sourceCodeFor = (organisationId: string) => `INS-${organisationId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;

@Injectable()
export class InspectionService {
  constructor(
    @Inject(InspectionRepository) private readonly repo: InspectionRepository,
    @Inject(GarageService) private readonly garage: GarageService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /** Same car lookup as the garage bay: make, model, colour, last 4 of chassis, last mileage — nothing about people. */
  lookup(plate: string) {
    return this.garage.lookup(plate);
  }

  // ------------------------------------------------------------------ drafts

  async saveDraft(actor: Actor, organisationId: string, id: string, d: InspectionDraftInput): Promise<InspectionRow> {
    const existing = await this.repo.get(id);
    if (existing && existing.organisationId !== organisationId) throw new InspectionError('inspection_not_found', 'No such inspection');
    if (existing && existing.status !== 'draft') throw new InspectionError('not_editable', 'This inspection has been sent and can no longer be changed');
    let vehicleId: string | null = null;
    if (d.vehicleRef) {
      vehicleId = (await this.registry.idForRef(d.vehicleRef)) ?? null;
      if (!vehicleId) throw new InspectionError('vehicle_not_found', 'No such vehicle');
    }
    const row = { id, plateEntered: d.plateEntered, vehicleId, form: d.form, clientCreatedAt: d.clientCreatedAt };
    const ok = existing
      ? await this.repo.update({ ...row, expectedVersion: d.version })
      : await this.repo.insert({ ...row, organisationId, createdBy: actor.userId });
    if (!ok) throw new InspectionError('version_conflict', 'This inspection was changed on another device; reload it first');
    return (await this.repo.get(id))!;
  }

  async get(organisationId: string, id: string): Promise<InspectionRow> {
    const r = await this.repo.get(id);
    if (!r || r.organisationId !== organisationId) throw new InspectionError('inspection_not_found', 'No such inspection');
    return r;
  }

  list(organisationId: string, status: InspectionStatus | undefined, limit: number): Promise<InspectionRow[]> {
    return this.repo.list(organisationId, status, limit);
  }

  async view(r: InspectionRow) {
    const [names, vehicle] = await Promise.all([this.iam.displayNames([r.createdBy]), r.vehicleId ? this.registry.getVehicle(r.vehicleId) : undefined]);
    return {
      inspectionId: r.id,
      publicRef: r.publicRef,
      status: r.status,
      plateEntered: r.plateEntered,
      ...(vehicle ? { vehicleRef: vehicle.publicRef } : {}),
      form: r.form,
      createdBy: { userId: r.createdBy, displayName: names.get(r.createdBy) ?? '' },
      clientCreatedAt: r.clientCreatedAt,
      submittedAt: r.submittedAt,
      submissionId: r.submissionId,
      acknowledgedWarnings: r.acknowledgedWarnings,
      rejectionReason: r.rejectionReason,
      version: r.version,
    };
  }

  // ------------------------------------------------------------------ submit

  /** What the inspector saw differs from SAZO's records: worth a second look, but it is still recorded (the finding matters). */
  private async checks(r: InspectionRow, vehicleId: string | null, candidate: LookupCandidate | undefined, plateCandidates: number): Promise<InspectionWarning[]> {
    const w: InspectionWarning[] = [];
    if (new Date(r.clientCreatedAt).getTime() > Date.now() + 10 * 60_000) {
      w.push({ code: 'date_impossible', severity: 'serious', message: 'The inspection date is in the future. Check the phone’s date and time.', blocking: true });
    }
    if (plateCandidates > 1) {
      w.push({ code: 'plate_on_several_vehicles', severity: 'serious', message: `SAZO has ${plateCandidates} cars with plate ${r.plateEntered.toUpperCase()}. Choose the right one, or add the chassis number you see.`, blocking: false });
    }
    if (!vehicleId) return w;
    const f = r.form;
    const km = kmOf(f.mileage!);
    if (candidate?.lastMileage && km < candidate.lastMileage.km * (1 - PARAMS.mileage.decreaseTolerance)) {
      w.push({ code: 'mileage_lower_than_last', severity: 'serious', message: `The odometer shows ${km.toLocaleString('en-UG')} km, but ${candidate.lastMileage.km.toLocaleString('en-UG')} km was recorded on ${candidate.lastMileage.on}.`, blocking: false });
    }
    if (f.identity?.chassisSeen) {
      const seen = normalizeIdentifier(f.identity.chassisSeen);
      const anchors = (await this.registry.identifiers(vehicleId)).filter((i) => (i.type === 'vin' || i.type === 'chassis_number') && i.status === 'active');
      if (anchors.length && !anchors.some((a) => normalizeIdentifier(a.valueRaw) === seen)) {
        w.push({ code: 'chassis_differs', severity: 'serious', message: 'The chassis number you saw is not the one SAZO has for this plate.', blocking: false });
      }
    }
    const engine = f.identity?.engineNumberSeen;
    if (engine && candidate?.expectedEngineNumber && normalizeIdentifier(engine) !== normalizeIdentifier(candidate.expectedEngineNumber)) {
      w.push({ code: 'engine_number_differs', severity: 'attention', message: `The engine number you saw is not the one on record (${candidate.expectedEngineNumber}).`, blocking: false });
    }
    const colour = f.identity?.colourSeen;
    if (colour && candidate?.colour && colour.trim().toLowerCase() !== candidate.colour.trim().toLowerCase()) {
      w.push({ code: 'colour_differs', severity: 'attention', message: `The colour you saw (${colour}) is not the recorded colour (${candidate.colour}).`, blocking: false });
    }
    return w;
  }

  /** Photos must exist, be of the right kind, and have been taken by someone in this organisation. */
  private async evidenceErrors(r: InspectionRow): Promise<InspectionFieldError[]> {
    const refs = inspectionEvidenceRefs(r.form);
    const files = new Map((await this.evidence.view(refs.map((x) => x.id))).map((f) => [f.evidenceId, f]));
    const errors: InspectionFieldError[] = [];
    for (const ref of refs) {
      const f = files.get(ref.id);
      if (!f || !f.uploadedBy || !(await this.iam.isActiveMember(f.uploadedBy, r.organisationId))) {
        errors.push({ path: ref.path, code: 'evidence_not_found', message: 'Photo not found — upload it again' });
      } else if (ref.kind && f.kind !== ref.kind) {
        errors.push({ path: ref.path, code: 'evidence_wrong_kind', message: `This should be a ${ref.kind.replace(/_/g, ' ')}` });
      }
    }
    return errors;
  }

  private async ensureSource(organisationId: string): Promise<string> {
    const code = sourceCodeFor(organisationId);
    if (!(await this.ingestion.sourceByCode(code))) {
      const org = await this.iam.organisation(organisationId);
      await this.ingestion.upsertSource({
        code, name: org?.tradingName ?? org?.legalName ?? code, organisationId, domain: 'inspection', channel: 'inspector_app', isSimulated: false,
        evidenceClass: 'inspection', baselineReputation: PARAMS.baseline.inspection, coverage: [{ scope: 'own_customers', from: new Date().toISOString().slice(0, 10) }],
      });
    }
    return code;
  }

  /**
   * The inspection report SAZO keeps: the full checklist, who inspected, when, and the fingerprint of every
   * photo. Stored write-once and hashed like any other evidence, so it can't be changed later.
   */
  private async writeReport(actor: Actor, r: InspectionRow, vehicleRef: string | undefined): Promise<string> {
    const [org, names, photos] = await Promise.all([
      this.iam.organisation(r.organisationId), this.iam.displayNames([r.createdBy]),
      this.evidence.view(inspectionEvidenceRefs(r.form).map((x) => x.id)),
    ]);
    const report = {
      sazoInspectionReport: 1,
      reference: r.publicRef,
      organisation: org?.tradingName ?? org?.legalName ?? '',
      inspector: names.get(r.createdBy) ?? '',
      inspectedAt: r.clientCreatedAt,
      plate: r.plateEntered.toUpperCase(),
      ...(vehicleRef ? { vehicleRef } : {}),
      checklist: r.form,
      repaintedPanels: repaintedPanels(r.form.paint?.readings).map((p) => PANEL_LABELS[p as Panel] ?? p),
      photos: photos.map((p) => ({ evidenceId: p.evidenceId, kind: p.kind, sha256: p.sha256 })),
    };
    const bytes = Buffer.from(JSON.stringify(report, null, 2));
    const slot = await this.evidence.start(actor.userId, {
      kind: 'inspection_report', mimeType: 'application/json', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), capturedAt: r.clientCreatedAt,
    });
    await this.evidence.putContent(slot.uploadId, actor.userId, bytes);
    return (await this.evidence.complete(slot.uploadId, actor.userId)).evidenceId;
  }

  async submit(actor: Actor, organisationId: string, id: string, idempotencyKey: string, acknowledged: { code: string; explanation: string }[]) {
    const r = await this.get(organisationId, id);
    if (r.status !== 'draft') {
      if (r.submitKey === idempotencyKey && r.submissionId) return this.submitResult(r);
      throw new InspectionError('already_submitted', 'This inspection has already been sent');
    }
    const incomplete = inspectionErrors(r.form);
    if (incomplete.length) throw new InspectionError('incomplete', 'Some steps are not finished', incomplete);
    const badEvidence = await this.evidenceErrors(r);
    if (badEvidence.length) throw new InspectionError('evidence_invalid', 'Some photos are missing or wrong', badEvidence);

    const found = await this.lookup(r.plateEntered).catch(() => ({ outcome: 'not_found' as const, candidates: [] as LookupCandidate[] }));
    let vehicleId = r.vehicleId;
    let candidate: LookupCandidate | undefined;
    if (vehicleId) {
      const ref = (await this.registry.getVehicle(vehicleId))?.publicRef;
      candidate = found.candidates.find((c) => c.vehicleRef === ref);
    } else if (found.outcome === 'found') {
      candidate = found.candidates[0];
      vehicleId = (await this.registry.idForRef(candidate!.vehicleRef)) ?? null;
    } else if (found.outcome === 'not_found' && !r.form.identity?.chassisSeen) {
      throw new InspectionError('chassis_required', 'This car is new to SAZO — enter the chassis number you see and photograph it', [{ path: 'form.identity.chassisSeen', code: 'required', message: 'chassis number' }]);
    }
    const warnings = await this.checks(r, vehicleId, candidate, r.vehicleId ? 1 : found.candidates.length);
    const blocking = warnings.filter((w) => w.blocking);
    if (blocking.length) throw new InspectionError('blocked', 'This inspection cannot be sent as it is', blocking);
    const acks = new Map(acknowledged.map((a) => [a.code, a.explanation]));
    const open = warnings.filter((w) => !acks.get(w.code)?.trim());
    if (open.length) throw new InspectionError('warnings_need_acknowledgement', 'Please check these before sending; explain to continue', open);
    const accepted = warnings.map((w) => ({ code: w.code, explanation: acks.get(w.code)! }));

    if (!(await this.repo.claimForSubmit(r.id, idempotencyKey, accepted))) throw new InspectionError('already_submitted', 'This inspection has already been sent');
    try {
      const vehicleRef = vehicleId ? (await this.registry.getVehicle(vehicleId))?.publicRef : undefined;
      const reportId = await this.writeReport(actor, r, vehicleRef);
      const sourceCode = await this.ensureSource(organisationId);
      const result = await this.ingestion.submit(sourceCode, {
        schemaVersion: 1,
        items: [{ identifiers: await this.identifiersFor(vehicleId, r), records: inspectionRecords(r.form, r.clientCreatedAt, reportId) }],
      }, { idempotencyKey, userId: actor.userId, organisationId });
      const item = result.items[0]!;
      const status: InspectionStatus = item.status === 'accepted' ? 'accepted' : item.status === 'rejected' ? 'rejected' : 'submitted';
      await this.repo.recordOutcome(r.id, {
        submissionId: result.submissionId, status, vehicleId: item.vehicleId ?? null, reportEvidenceId: reportId,
        rejectionReason: status === 'rejected' ? item.errors.map((e) => e.message).join('; ') || 'rejected' : null,
      });
    } catch (err) {
      await this.repo.releaseClaim(r.id);
      if (err instanceof IngestionError && err.code === 'organisation_not_approved') throw new InspectionError('organisation_not_approved', err.message);
      throw err;
    }
    return this.submitResult((await this.repo.get(r.id))!);
  }

  private async submitResult(r: InspectionRow) {
    const vehicle = r.vehicleId ? await this.registry.getVehicle(r.vehicleId) : undefined;
    return {
      inspectionId: r.id,
      submissionId: r.submissionId!,
      status: r.status,
      ...(vehicle ? { vehicleRef: vehicle.publicRef } : {}),
      acknowledgedWarnings: r.acknowledgedWarnings,
      ...(r.rejectionReason ? { rejectionReason: r.rejectionReason } : {}),
    };
  }

  /** The chassis number the inspector read off the car wins; otherwise SAZO's anchor for the chosen car. Plus the plate. */
  private async identifiersFor(vehicleId: string | null, r: InspectionRow): Promise<{ vin?: string; chassisNumber?: string; plate: string }> {
    const plate = r.plateEntered;
    const seen = r.form.identity?.chassisSeen;
    if (seen) return { ...(classifyIdentifier(seen).kind === 'vin' ? { vin: seen } : { chassisNumber: seen }), plate };
    if (!vehicleId) return { plate };
    const idents = await this.registry.identifiers(vehicleId);
    const vin = idents.find((i) => i.type === 'vin' && i.status === 'active');
    const chassis = idents.find((i) => i.type === 'chassis_number' && i.status === 'active');
    return { ...(vin ? { vin: vin.valueRaw } : chassis ? { chassisNumber: chassis.valueRaw } : {}), plate };
  }
}

