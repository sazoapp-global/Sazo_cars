// Inspector workspace API. Every call acts for one inspector / inspection centre: X-Organisation-Id header.
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { canForOrg, CurrentActor, IamService, type Actor } from '../iam/index.js';
import { InspectionDraftInput } from './inspection-records.js';
import { InspectionError, InspectionService } from './inspection.service.js';

const Uuid = z.string().uuid();
const Submit = z.object({
  acknowledgedWarnings: z.array(z.object({ code: z.string(), explanation: z.string().trim().min(3).max(500) })).max(10).default([]),
});
export const INSPECTION_ORG_TYPES = ['inspector', 'inspection_centre'];

function problem(err: unknown): never {
  if (err instanceof InspectionError) {
    const status = ({
      inspection_not_found: 404, vehicle_not_found: 404, version_conflict: 409, not_editable: 409, already_submitted: 409,
      incomplete: 400, evidence_invalid: 422, chassis_required: 422, warnings_need_acknowledgement: 422, blocked: 422, organisation_not_approved: 403,
    } as const)[err.code];
    throw new Problem(status, err.code, status === 404 ? 'Not found' : status === 409 ? 'Conflict' : status === 403 ? 'Forbidden' : status === 400 ? 'Invalid request' : 'Unprocessable', err.message, err.details);
  }
  throw err;
}

@Controller('inspections')
export class InspectionController {
  constructor(
    @Inject(InspectionService) private readonly inspections: InspectionService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /** The caller must act for an APPROVED inspector or inspection centre with this permission (D-055 applies to inspectors too). */
  private async org(actor: Actor, orgId: string | undefined, permission: string): Promise<string> {
    if (!orgId || !Uuid.safeParse(orgId).success) throw badRequest('organisation_required', 'Send the X-Organisation-Id header');
    const access = canForOrg(actor, orgId, permission);
    if (!access.ok) {
      if (access.code === 'organisation_not_approved') throw new Problem(403, 'organisation_not_approved', 'Forbidden', 'Your business has not been approved yet');
      throw new Problem(403, 'forbidden', 'Forbidden', 'You cannot do this for this organisation');
    }
    const type = access.membership?.organisationType ?? (await this.iam.organisation(orgId))?.type;
    if (!type || !INSPECTION_ORG_TYPES.includes(type)) throw new Problem(403, 'not_an_inspector', 'Forbidden', 'This organisation does not do inspections');
    return orgId;
  }

  /** GET /v1/inspections/vehicles/lookup?plate= */
  @Get('vehicles/lookup')
  async lookup(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('plate') plate?: string) {
    await this.org(actor, orgId, 'inspection.create');
    if (!plate || plate.trim().length < 4 || plate.length > 12) throw badRequest('invalid_query', 'plate must be 4–12 characters');
    return this.inspections.lookup(plate).catch((err: { code?: string; message?: string }) => {
      if (err.code === 'invalid_plate') throw badRequest('invalid_plate', err.message ?? 'Not a number plate');
      throw err;
    });
  }

  /** GET /v1/inspections?status= */
  @Get()
  async list(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('status') status?: string, @Query('limit') limit?: string) {
    const org = await this.org(actor, orgId, 'inspection.create');
    const s = status === undefined ? undefined : z.enum(['draft', 'submitted', 'accepted', 'rejected']).safeParse(status);
    if (s && !s.success) throw badRequest('invalid_query', 'Unknown status');
    const rows = await this.inspections.list(org, s?.data, Math.min(Math.max(Number(limit) || 25, 1), 100));
    return { items: await Promise.all(rows.map((r) => this.inspections.view(r))), nextCursor: null };
  }

  /** PUT /v1/inspections/:id — create or update a draft (offline-safe upsert by a phone-made id). */
  @Put(':id')
  async save(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'inspection.create');
    if (!Uuid.safeParse(id).success) throw badRequest('invalid_id', 'id must be a UUID generated on the device');
    const d = InspectionDraftInput.safeParse(body);
    if (!d.success) throw badRequest('invalid_request', 'Check the fields', d.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
    return this.inspections.view(await this.inspections.saveDraft(actor, org, id, d.data).catch(problem));
  }

  /** GET /v1/inspections/:id */
  @Get(':id')
  async get(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await this.org(actor, orgId, 'inspection.create');
    if (!Uuid.safeParse(id).success) throw notFound('inspection_not_found', 'No such inspection');
    return this.inspections.view(await this.inspections.get(org, id).catch(problem));
  }

  /** POST /v1/inspections/:id/submit — the report file is written and the inspection goes through Ingestion. */
  @Post(':id/submit')
  @HttpCode(202)
  async submit(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Headers('idempotency-key') key: string | undefined,
    @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'inspection.submit');
    if (!key || !Uuid.safeParse(key).success) throw badRequest('idempotency_key_required', 'Send an Idempotency-Key header (UUID)');
    if (!Uuid.safeParse(id).success) throw notFound('inspection_not_found', 'No such inspection');
    const b = Submit.safeParse(body ?? {});
    if (!b.success) throw badRequest('invalid_request', 'acknowledgedWarnings need a code and an explanation');
    return this.inspections.submit(actor, org, id, key, b.data.acknowledgedWarnings).catch(problem);
  }
}
