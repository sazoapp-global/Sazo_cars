import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, RequirePermission, type Actor } from '../iam/index.js';
import { FuelError, FuelService } from './fuel.service.js';
import { OwnershipError, OwnershipService } from './ownership.service.js';
import { ReportNotFound } from './reports.service.js';

const REF = z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);

function problem(err: unknown): never {
  if (err instanceof ReportNotFound) throw notFound('vehicle_not_found', 'No such vehicle');
  if (err instanceof FuelError) throw new Problem(422, err.code, 'Unprocessable', err.message);
  if (err instanceof OwnershipError) {
    const status = ({ no_phone_match: 422, logbook_invalid: 422, already_claimed: 409, already_answered: 409, before_your_time: 422, not_owner: 403, visit_not_found: 404, claim_not_found: 404 } as const)[err.code];
    throw new Problem(status, err.code, status === 404 ? 'Not found' : status === 403 ? 'Forbidden' : status === 409 ? 'Conflict' : 'Unprocessable', err.message);
  }
  throw err;
}

@Controller()
export class OwnershipController {
  constructor(
    @Inject(OwnershipService) private readonly ownership: OwnershipService,
    @Inject(FuelService) private readonly fuel: FuelService,
  ) {}

  /** GET /v1/me/cars/:ref/fuel — my fuel log for a car I own, with my average (D-148). */
  @Get('me/cars/:ref/fuel')
  @RequirePermission('ownership.claim')
  async fuelLog(@CurrentActor() actor: Actor, @Param('ref') ref: string) {
    if (!REF.safeParse(ref).success) throw notFound('vehicle_not_found', 'No such vehicle');
    const car = await this.ownership.ownedCar(actor.userId, ref).catch(problem);
    return this.fuel.log(actor.userId, car.family);
  }

  /** POST /v1/me/cars/:ref/fuel — a fill-up: { filledOn, litres, odometerKm, fullTank }. Confirmed owners only. */
  @Post('me/cars/:ref/fuel')
  @HttpCode(201)
  @RequirePermission('ownership.claim')
  async addFillup(@CurrentActor() actor: Actor, @Param('ref') ref: string, @Body() body: unknown) {
    if (!REF.safeParse(ref).success) throw notFound('vehicle_not_found', 'No such vehicle');
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const b = z.object({
      filledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => d <= today, 'cannot be in the future'),
      litres: z.number().positive().max(1000),
      odometerKm: z.number().int().min(0).max(2_000_000),
      fullTank: z.boolean(),
    }).strict().safeParse(body);
    if (!b.success) throw badRequest('invalid_request', b.error.issues[0]?.message ?? 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const car = await this.ownership.ownedCar(actor.userId, ref).catch(problem);
    const id = await this.fuel.add(actor.userId, car.id, b.data).catch(problem);
    return { id, ...(await this.fuel.log(actor.userId, car.family)) };
  }

  /** DELETE /v1/me/cars/:ref/fuel/:id — take back a fill-up typed by mistake. */
  @Delete('me/cars/:ref/fuel/:id')
  @HttpCode(204)
  @RequirePermission('ownership.claim')
  async removeFillup(@CurrentActor() actor: Actor, @Param('ref') ref: string, @Param('id') id: string) {
    if (!REF.safeParse(ref).success || !z.string().uuid().safeParse(id).success) throw notFound('fillup_not_found', 'No such fill-up');
    const car = await this.ownership.ownedCar(actor.userId, ref).catch(problem);
    if (!(await this.fuel.remove(actor.userId, car.family, id))) throw notFound('fillup_not_found', 'No such fill-up');
  }

  /** POST /v1/vehicles/:ref/ownership-claims — "this is my car" (phone match, else logbook photo). */
  @Post('vehicles/:ref/ownership-claims')
  @HttpCode(200)
  @RequirePermission('ownership.claim')
  async claim(@CurrentActor() actor: Actor, @Param('ref') ref: string, @Body() body: unknown) {
    if (!REF.safeParse(ref).success) throw notFound('vehicle_not_found', 'No such vehicle');
    const b = z.object({ logbookEvidenceId: z.string().uuid().optional() }).safeParse(body ?? {});
    if (!b.success) throw badRequest('invalid_request', 'logbookEvidenceId must be an uploaded file id');
    return this.ownership.claim(actor, ref, b.data.logbookEvidenceId).catch(problem);
  }

  /** GET /v1/me/cars */
  @Get('me/cars')
  @RequirePermission('ownership.claim')
  async cars(@CurrentActor() actor: Actor) {
    return { items: await this.ownership.myCars(actor.userId) };
  }

  /** DELETE /v1/me/cars/:ref — no longer my car / withdraw a pending claim. */
  @Delete('me/cars/:ref')
  @HttpCode(204)
  @RequirePermission('ownership.claim')
  async withdraw(@CurrentActor() actor: Actor, @Param('ref') ref: string) {
    if (REF.safeParse(ref).success) await this.ownership.withdraw(actor.userId, ref);
  }

  /** GET /v1/me/cars/:ref/visits — garage visits on my car and my answers. */
  @Get('me/cars/:ref/visits')
  @RequirePermission('ownership.claim')
  async visits(@CurrentActor() actor: Actor, @Param('ref') ref: string) {
    if (!REF.safeParse(ref).success) throw notFound('vehicle_not_found', 'No such vehicle');
    return { items: await this.ownership.visits(actor.userId, ref).catch(problem) };
  }

  /** POST /v1/me/cars/:ref/visits/:eventId — confirm or dispute, as the registered owner. */
  @Post('me/cars/:ref/visits/:eventId')
  @HttpCode(204)
  @RequirePermission('ownership.claim')
  async answer(@CurrentActor() actor: Actor, @Param('ref') ref: string, @Param('eventId') eventId: string, @Body() body: unknown) {
    const b = z.object({ response: z.enum(['confirmed', 'disputed']), comment: z.string().trim().max(500).optional() }).safeParse(body);
    if (!b.success || !REF.safeParse(ref).success || !z.string().uuid().safeParse(eventId).success) throw badRequest('invalid_request', 'response must be confirmed or disputed');
    await this.ownership.answerVisit(actor.userId, ref, eventId, b.data.response, b.data.comment).catch(problem);
  }

  /** GET /v1/admin/ownership-claims — logbook claims waiting for a reviewer. */
  @Get('admin/ownership-claims')
  @RequirePermission('ownership.review')
  async pending() {
    return { items: await this.ownership.pending() };
  }

  /** POST /v1/admin/ownership-claims/:id/decision */
  @Post('admin/ownership-claims/:id/decision')
  @HttpCode(200)
  @RequirePermission('ownership.review')
  async decide(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().min(3).max(500).transform(tidySentence) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'decision and reason are required');
    if (!z.string().uuid().safeParse(id).success || !(await this.ownership.decide(actor, id, b.data.decision, b.data.reason))) throw notFound('claim_not_found', 'No such pending claim');
    return { status: b.data.decision === 'approve' ? 'verified' : 'rejected' };
  }
}
