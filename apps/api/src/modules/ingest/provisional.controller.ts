// POST /v1/vehicles/provisional — a buyer or owner adds a car SAZO doesn't know (D-032, P-010).
// It becomes an owner-provided submission on the OWNER source: lowest trust, labelled "not yet confirmed",
// and confirmed only when an official record matches it.
import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest } from '../../platform/problem.js';
import { CurrentActor, RequirePermission, type Actor } from '../iam/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { IngestionService } from './ingestion.service.js';

/** A fixed id for SAZO itself as the owner of the "owner submissions" source. */
const SAZO_ORG_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_SOURCE = 'OWNER';
const PER_DAY = 5;

const Input = z.object({
  plate: z.string().trim().min(4).max(15).optional(),
  vin: z.string().trim().length(17).optional(),
  chassisNumber: z.string().trim().min(6).max(25).optional(),
  make: z.string().trim().min(2).max(40),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
  colour: z.string().trim().min(2).max(40).optional(),
}).refine((x) => x.plate || x.vin || x.chassisNumber, { message: 'Give the plate, VIN or chassis number' });

@Controller('vehicles')
export class ProvisionalController {
  constructor(
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
  ) {}

  private async ownerSource(): Promise<string> {
    if (!(await this.ingestion.sourceByCode(OWNER_SOURCE))) {
      await this.ingestion.upsertSource({
        code: OWNER_SOURCE, name: 'Owner and buyer submissions', organisationId: SAZO_ORG_ID, domain: 'owner', channel: 'user_submission',
        isSimulated: false, evidenceClass: 'owner_provided', baselineReputation: 0.35, coverage: [],
      });
    }
    return OWNER_SOURCE;
  }

  @Post('provisional')
  @HttpCode(202)
  @RequirePermission('vehicle.provisional.create')
  async add(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = Input.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const v = b.data;
    // Already known? Send them to it instead of creating a second copy.
    for (const q of [v.vin, v.chassisNumber, v.plate].filter((x): x is string => !!x)) {
      const found = await this.registry.search(q);
      if (found.matches.length) throw new Problem(409, 'vehicle_exists', 'Conflict', found.matches.map((m) => m.vehicleRef).join(','));
    }
    const code = await this.ownerSource();
    const source = (await this.ingestion.sourceByCode(code))!;
    if ((await this.ingestion.countRecentByUser(source.id, actor.userId, 24)) >= PER_DAY) {
      throw new Problem(429, 'rate_limited', 'Too many requests', `You can add up to ${PER_DAY} cars a day`);
    }
    const result = await this.ingestion.submit(code, {
      schemaVersion: 1,
      items: [{
        identifiers: { ...(v.vin ? { vin: v.vin } : {}), ...(v.chassisNumber ? { chassisNumber: v.chassisNumber } : {}), ...(v.plate ? { plate: v.plate } : {}) },
        records: [{ type: 'spec_declared', attributes: { make: v.make, model: v.model, year: v.year, ...(v.colour ? { colour: v.colour } : {}) }, time: { at: new Date().toISOString(), precision: 'day' } }],
      }],
    }, { idempotencyKey: randomUUID(), userId: actor.userId, organisationId: SAZO_ORG_ID });
    const item = result.items[0]!;
    return { submissionId: result.submissionId, status: item.status, vehicleRef: item.vehicleRef ?? null, errors: item.errors };
  }
}
