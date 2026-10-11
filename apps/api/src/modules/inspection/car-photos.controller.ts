// Photos of a car for signed-in buyers (Oct 2026 redesign): only the car views an inspector takes for the
// checklist (front, back, sides, damage). Garage, odometer, chassis, engine and document photos stay private
// because they can show people, places or identifiers.
import { Controller, Get, Header, Inject, Param, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { notFound } from '../../platform/problem.js';
import { IamService, RequirePermission } from '../iam/index.js';
import { EvidenceService } from '../obs/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { InspectionRepository } from './inspection.repository.js';

const REF = z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
const Uuid = z.string().uuid();
const MAX = 12;

@Controller('vehicles')
export class CarPhotosController {
  constructor(
    @Inject(InspectionRepository) private readonly repo: InspectionRepository,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  private async photos(ref: string) {
    if (!REF.safeParse(ref).success) throw notFound('vehicle_not_found', 'No such vehicle');
    const id = await this.registry.idForRef(ref);
    if (!id) throw notFound('vehicle_not_found', 'No such vehicle');
    const inspections = await this.repo.carPhotos(await this.registry.mergeFamily(id));
    const out: { photoId: string; takenAt: string; organisationId: string }[] = [];
    for (const i of inspections) for (const p of i.photoIds) if (out.length < MAX) out.push({ photoId: p, takenAt: i.at, organisationId: i.organisationId });
    return out;
  }

  /** GET /v1/vehicles/:ref/photos — newest first, with who took them (the inspector's business) and when. */
  @Get(':ref/photos')
  @RequirePermission('vehicle.report.full.read')
  async list(@Param('ref') ref: string) {
    const items = await this.photos(ref);
    const orgs = new Map<string, string>();
    for (const o of new Set(items.map((i) => i.organisationId))) {
      const org = await this.iam.organisation(o);
      orgs.set(o, org?.tradingName ?? org?.legalName ?? 'An inspector');
    }
    return { items: items.map((i) => ({ photoId: i.photoId, takenAt: i.takenAt, takenBy: orgs.get(i.organisationId)! })) };
  }

  /** GET /v1/vehicles/:ref/photos/:id — the image, only if it is one of this car's inspection photos. */
  @Get(':ref/photos/:id')
  @RequirePermission('vehicle.report.full.read')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  @Header('Cache-Control', 'private, max-age=3600')
  async content(@Param('ref') ref: string, @Param('id') id: string) {
    if (!Uuid.safeParse(id).success || !(await this.photos(ref)).some((p) => p.photoId === id)) throw notFound('photo_not_found', 'No such photo');
    const f = await this.evidence.content(id);
    if (!f || !f.mime.startsWith('image/')) throw notFound('photo_not_found', 'No such photo');
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline', length: f.bytes.length });
  }
}
