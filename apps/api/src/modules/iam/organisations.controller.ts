import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { badRequest, notFound } from '../../platform/problem.js';
import type { Actor } from './actor.js';
import { CurrentActor, RequirePermission } from './auth.guard.js';
import { BUSINESS_ORG_TYPES, IamService } from './iam.service.js';

const Register = z.object({
  type: z.enum(BUSINESS_ORG_TYPES),
  legalName: z.string().trim().min(2).max(200),
  tradingName: z.string().trim().max(200).optional(),
  registrationNumber: z.string().trim().max(60).optional(),
  district: z.string().trim().max(80).optional(),
  contactPhone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).optional(),
});
const Decision = z.object({ decision: z.enum(['approve', 'reject', 'request_info', 'suspend']), reason: z.string().trim().min(3) });

@Controller()
export class OrganisationsController {
  constructor(@Inject(IamService) private readonly iam: IamService) {}

  /** POST /v1/organisations — business sign-up; starts "pending verification" (D-055). */
  @Post('organisations')
  async register(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const r = Register.safeParse(body);
    if (!r.success) throw badRequest('invalid_request', 'Check the fields', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    return this.iam.registerOrganisation(actor, r.data);
  }

  /** GET /v1/admin/organisations?status=pending_verification — the verification queue. */
  @Get('admin/organisations')
  @RequirePermission('organisation.approve')
  async list(@Query('status') status?: string, @Query('type') type?: string) {
    return { items: await this.iam.listOrganisations({ status, type }), nextCursor: null };
  }

  /** POST /v1/admin/organisations/:id/decision */
  @Post('admin/organisations/:id/decision')
  @HttpCode(200)
  @RequirePermission('organisation.approve')
  async decide(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const d = Decision.safeParse(body);
    if (!d.success) throw badRequest('invalid_request', 'decision and reason are required');
    if (!z.string().uuid().safeParse(id).success || !(await this.iam.organisation(id))) throw notFound('organisation_not_found', 'No such organisation');
    return this.iam.decideOrganisation(actor, id, d.data.decision, d.data.reason);
  }
}
