// Community API (D-063, P-008): reading is public; writing needs sign-in; moderators publish.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, Public, RequirePermission, type Actor } from '../iam/index.js';
import { CommunityError, CommunityService } from './community.service.js';

const Uuid = z.string().uuid();
function problem(err: unknown): never {
  if (err instanceof CommunityError) {
    const status = ({ model_not_found: 404, case_not_found: 404, already_reviewed: 409, link_exists: 409, link_not_allowed: 422 } as const)[err.code];
    throw new Problem(status, err.code, status === 404 ? 'Not found' : status === 409 ? 'Conflict' : 'Unprocessable', err.message);
  }
  throw err;
}
const model = (id: string) => { if (!Uuid.safeParse(id).success) throw notFound('model_not_found', 'No such model'); return id; };

@Controller()
export class CommunityController {
  constructor(@Inject(CommunityService) private readonly community: CommunityService) {}

  /** GET /v1/models/:modelId/community — published reviews and creator videos for a model. */
  @Public()
  @Get('models/:modelId/community')
  async read(@CurrentActor() actor: Actor | undefined, @Param('modelId') modelId: string) {
    return this.community.forModel(model(modelId), actor?.userId).catch(problem);
  }

  /** POST /v1/models/:modelId/reviews — waits for a moderator. */
  @Post('models/:modelId/reviews')
  @RequirePermission('community.contribute')
  async review(@CurrentActor() actor: Actor, @Param('modelId') modelId: string, @Body() body: unknown) {
    const b = z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().min(30).max(2000) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Give a rating from 1 to 5 and at least 30 characters');
    return this.community.review(actor, model(modelId), b.data).catch(problem);
  }

  /** POST /v1/models/:modelId/creator-links — a TikTok / YouTube / Instagram video; waits for a moderator (P-008). */
  @Post('models/:modelId/creator-links')
  @RequirePermission('community.contribute')
  async link(@CurrentActor() actor: Actor, @Param('modelId') modelId: string, @Body() body: unknown) {
    const b = z.object({ url: z.string().trim().url().max(500), title: z.string().trim().max(120).optional() }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Give the video link');
    return this.community.suggestLink(actor, model(modelId), b.data).catch(problem);
  }

  /** GET /v1/admin/moderation?status= */
  @Get('admin/moderation')
  @RequirePermission('moderation.decide')
  async queue(@Query('status') status?: string) {
    const s = z.enum(['open', 'approved', 'rejected']).default('open').safeParse(status);
    if (!s.success) throw badRequest('invalid_query', 'Unknown status');
    return { items: await this.community.queue(s.data) };
  }

  /** POST /v1/admin/moderation/:caseId/decision */
  @Post('admin/moderation/:caseId/decision')
  @HttpCode(200)
  @RequirePermission('moderation.decide')
  async decide(@CurrentActor() actor: Actor, @Param('caseId') caseId: string, @Body() body: unknown) {
    if (!Uuid.safeParse(caseId).success) problem(new CommunityError('case_not_found', 'No such case'));
    const b = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().min(3).max(500) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'decision and reason are required');
    await this.community.decide(actor, caseId, b.data.decision, b.data.reason).catch(problem);
    return { ok: true };
  }
}
