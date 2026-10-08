// Concerns API (O-002): businesses report from their apps; SAZO staff review.
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { CONCERN_CATEGORIES } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest } from '../../platform/problem.js';
import { canForOrg, CurrentActor, IamService, RequirePermission, type Actor } from '../iam/index.js';
import { ConcernError, ConcernService } from './concern.service.js';

const Uuid = z.string().uuid();
const REPORTING_TYPES = ['garage', 'inspector', 'inspection_centre', 'dealer'];
const Report = z.object({
  plate: z.string().trim().min(2).max(15),
  vehicleRef: z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/).optional(),
  category: z.enum(CONCERN_CATEGORIES),
  description: z.string().trim().min(10).max(2000),
  evidenceIds: z.array(Uuid).max(10).default([]),
});

function problem(err: unknown): never {
  if (err instanceof ConcernError) {
    const status = ({ vehicle_not_found: 404, concern_not_found: 404, evidence_invalid: 422, too_many_reports: 429 } as const)[err.code];
    throw new Problem(status, err.code, status === 404 ? 'Not found' : status === 429 ? 'Too many requests' : 'Unprocessable', err.message);
  }
  throw err;
}

@Controller()
export class ConcernController {
  constructor(@Inject(ConcernService) private readonly concerns: ConcernService, @Inject(IamService) private readonly iam: IamService) {}

  private async org(actor: Actor, orgId: string | undefined): Promise<string> {
    if (!orgId || !Uuid.safeParse(orgId).success) throw badRequest('organisation_required', 'Send the X-Organisation-Id header');
    const access = canForOrg(actor, orgId, 'concern.report');
    if (!access.ok) {
      if (access.code === 'organisation_not_approved') throw new Problem(403, 'organisation_not_approved', 'Forbidden', 'Your business has not been approved yet');
      throw new Problem(403, 'forbidden', 'Forbidden', 'You cannot do this for this organisation');
    }
    const type = access.membership?.organisationType ?? (await this.iam.organisation(orgId))?.type;
    if (!type || !REPORTING_TYPES.includes(type)) throw new Problem(403, 'forbidden', 'Forbidden', 'This organisation cannot raise concerns');
    return orgId;
  }

  /** POST /v1/concerns — report signs of fraud on a car. */
  @Post('concerns')
  async report(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const b = Report.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'plate, category and a description (at least 10 characters) are required');
    return this.concerns.report(actor, org, b.data).catch(problem);
  }

  /** GET /v1/concerns — what this business has reported, and SAZO's decisions. */
  @Get('concerns')
  async mine(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined) {
    return { items: await this.concerns.forOrganisation(await this.org(actor, orgId)) };
  }

  /** GET /v1/admin/concerns?status= */
  @Get('admin/concerns')
  @RequirePermission('concern.review')
  async queue(@Query('status') status?: string) {
    const s = z.enum(['open', 'upheld', 'dismissed']).default('open').safeParse(status);
    if (!s.success) throw badRequest('invalid_query', 'Unknown status');
    return { items: await this.concerns.queue(s.data) };
  }

  /** POST /v1/admin/concerns/:id/decision */
  @Post('admin/concerns/:id/decision')
  @HttpCode(200)
  @RequirePermission('concern.review')
  async decide(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    if (!Uuid.safeParse(id).success) problem(new ConcernError('concern_not_found', 'No such concern'));
    const b = z.object({ decision: z.enum(['uphold', 'dismiss']), reason: z.string().trim().min(3).max(500),
      vehicleRef: z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/).optional() }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'decision and reason are required');
    await this.concerns.decide(actor, id, b.data).catch(problem);
    return { ok: true };
  }
}
