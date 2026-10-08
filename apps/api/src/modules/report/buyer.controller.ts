import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, Public, RequirePermission, type Actor } from '../iam/index.js';
import { BuyerError, BuyerService, SHARE_DAYS_DEFAULT } from './buyer.service.js';
import { ReportNotFound } from './reports.service.js';

const REF = z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);

function problem(err: unknown): never {
  if (err instanceof ReportNotFound) throw notFound('vehicle_not_found', 'No such vehicle');
  if (err instanceof BuyerError) {
    if (err.code === 'link_expired') throw new Problem(410, err.code, 'Gone', err.message);
    if (err.code === 'not_found') throw notFound('link_not_found', err.message);
    throw new Problem(409, err.code, 'Conflict', err.message);
  }
  throw err;
}

@Controller()
export class BuyerController {
  constructor(@Inject(BuyerService) private readonly buyer: BuyerService) {}

  /** GET /v1/me/saved-checks */
  @Get('me/saved-checks')
  @RequirePermission('saved_check.manage')
  async saved(@CurrentActor() actor: Actor) {
    return { items: await this.buyer.saved(actor.userId), nextCursor: null };
  }

  /** POST /v1/me/saved-checks — idempotent. */
  @Post('me/saved-checks')
  @HttpCode(204)
  @RequirePermission('saved_check.manage')
  async save(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = z.object({ vehicleRef: REF }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'vehicleRef is required');
    await this.buyer.save(actor.userId, b.data.vehicleRef).catch(problem);
  }

  /** GET /v1/me/saved-checks/:ref — is this car saved? */
  @Get('me/saved-checks/:ref')
  @RequirePermission('saved_check.manage')
  async isSaved(@CurrentActor() actor: Actor, @Param('ref') ref: string) {
    return { saved: REF.safeParse(ref).success && (await this.buyer.isSaved(actor.userId, ref)) };
  }

  /** DELETE /v1/me/saved-checks/:ref */
  @Delete('me/saved-checks/:ref')
  @HttpCode(204)
  @RequirePermission('saved_check.manage')
  async unsave(@CurrentActor() actor: Actor, @Param('ref') ref: string) {
    if (REF.safeParse(ref).success) await this.buyer.unsave(actor.userId, ref);
  }

  /** GET /v1/vehicles/compare?refs=A,B[,C] — question by question (D-042). */
  @Get('vehicles/compare')
  @RequirePermission('vehicle.report.full.read')
  async compare(@Query('refs') refs?: string) {
    const list = [...new Set((refs ?? '').split(',').map((r) => r.trim()).filter(Boolean))];
    if (list.length < 2 || list.length > 3 || !list.every((r) => REF.safeParse(r).success)) throw badRequest('invalid_query', 'Compare 2 or 3 vehicles: refs=SZV-…,SZV-…');
    return this.buyer.compare(list).catch(problem);
  }

  /** POST /v1/vehicles/:ref/snapshots — freeze the report; optionally make a share link. */
  @Post('vehicles/:ref/snapshots')
  @RequirePermission('vehicle.report.full.read')
  async snapshot(@CurrentActor() actor: Actor, @Param('ref') ref: string, @Body() body: unknown) {
    if (!REF.safeParse(ref).success) throw notFound('vehicle_not_found', 'No such vehicle');
    const b = z.object({ createShareLink: z.boolean().default(true), expiresInDays: z.number().int().min(1).max(90).default(SHARE_DAYS_DEFAULT) }).safeParse(body ?? {});
    if (!b.success) throw badRequest('invalid_request', 'expiresInDays must be 1–90');
    const s = await this.buyer.snapshot(actor.userId, ref, { share: b.data.createShareLink, expiresInDays: b.data.expiresInDays }).catch(problem);
    return { snapshotRef: s.snapshotRef, vehicleRef: s.vehicleRef, createdAt: s.createdAt, shareToken: s.token ?? null, expiresAt: s.expiresAt };
  }

  /** GET /v1/shared/:token — open a shared report (no sign-in). */
  @Public()
  @Get('shared/:token')
  async shared(@Param('token') token: string) {
    if (!/^[A-Za-z0-9_-]{22,64}$/.test(token)) throw notFound('link_not_found', 'This link is not valid');
    return this.buyer.openShared(token).catch(problem);
  }

  /** GET /v1/me/shares — links I have shared. */
  @Get('me/shares')
  async shares(@CurrentActor() actor: Actor) {
    return { items: await this.buyer.myShares(actor.userId) };
  }

  /** DELETE /v1/me/shares/:id — stop a link working. */
  @Delete('me/shares/:id')
  @HttpCode(204)
  async revoke(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success || !(await this.buyer.revokeShare(actor.userId, id))) throw notFound('link_not_found', 'No such link');
  }
}
