import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
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

  /** GET /v1/me/organisations — my businesses and where their verification stands. */
  @Get('me/organisations')
  async mine(@CurrentActor() actor: Actor) {
    return this.iam.myOrganisations(actor.userId);
  }

  /** POST /v1/organisations/:id/verification-documents — managers send documents for SAZO to check. */
  @Post('organisations/:id/verification-documents')
  @HttpCode(200)
  async documents(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ evidenceIds: z.array(z.string().uuid()).min(1).max(10) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'evidenceIds: 1–10 uploaded files');
    const isManager = actor.memberships.some((m) => m.organisationId === id && m.status === 'active' && m.role === 'org_manager');
    if (!isManager) throw notFound('organisation_not_found', 'No such organisation');
    if (!(await this.iam.addVerificationDocuments(actor, id, b.data.evidenceIds))) {
      throw new Problem(409, 'verification_closed', 'Conflict', 'This business has already been decided');
    }
    return { status: 'received' };
  }

  /** GET /v1/admin/organisations/:id/documents — ids of the documents a business sent (view via /v1/evidence/:id/content). */
  @Get('admin/organisations/:id/documents')
  @RequirePermission('organisation.approve')
  async adminDocuments(@Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success) throw notFound('organisation_not_found', 'No such organisation');
    return { evidenceIds: await this.iam.verificationDocuments(id) };
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
