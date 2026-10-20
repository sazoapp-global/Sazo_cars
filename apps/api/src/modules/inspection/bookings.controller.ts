// I-07: buyers book an inspection; inspectors answer from the Garage app (X-Organisation-Id header).
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { canForOrg, CurrentActor, IamService, type Actor } from '../iam/index.js';
import { BookingError, BookingsService, INSPECTOR_TYPES } from './bookings.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day as YYYY-MM-DD');
const RequestBody = z.object({
  organisationId: z.string().uuid(),
  plate: z.string().trim().min(2).max(15),
  vehicleRef: z.string().max(20).optional(),
  preferredDate: Day,
  place: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
const Decision = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accept'), scheduledAt: z.string().datetime({ offset: true }), note: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal('decline'), note: z.string().trim().min(3).max(500) }),
  z.object({ decision: z.literal('done'), note: z.string().trim().max(500).optional() }),
]);
const STATUSES = ['requested', 'accepted', 'declined', 'cancelled', 'done'] as const;

function problem(err: unknown): never {
  if (err instanceof BookingError) {
    if (err.code === 'booking_not_found' || err.code === 'inspector_not_found' || err.code === 'vehicle_not_found') throw notFound(err.code, err.message);
    if (err.code === 'not_allowed_now') throw new Problem(409, err.code, 'Conflict', err.message);
    throw badRequest(err.code, err.message);
  }
  throw err;
}

@Controller()
export class BookingsController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /** GET /v1/inspectors?district= — approved inspectors and inspection centres a buyer can ask. */
  @Get('inspectors')
  async inspectors(@Query('district') district?: string) {
    return { items: await this.bookings.inspectors(district?.slice(0, 60)) };
  }

  /** POST /v1/bookings — a buyer asks an inspector to check a car. */
  @Post('bookings')
  async request(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const parsed = RequestBody.safeParse(body);
    if (!parsed.success) throw badRequest('invalid_booking', 'Check the booking details', parsed.error.issues);
    return this.bookings.request(actor, parsed.data).catch(problem);
  }

  /** GET /v1/me/bookings — the buyer's bookings. */
  @Get('me/bookings')
  async mine(@CurrentActor() actor: Actor) {
    return { items: await this.bookings.mine(actor.userId) };
  }

  /** POST /v1/me/bookings/:id/cancel */
  @Post('me/bookings/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentActor() actor: Actor, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookings.cancel(actor.userId, id).catch(problem);
  }

  /** The caller must act for an APPROVED inspector or inspection centre (as for inspections). */
  private async org(actor: Actor, orgId: string | undefined): Promise<string> {
    if (!orgId || !z.string().uuid().safeParse(orgId).success) throw badRequest('organisation_required', 'Send the X-Organisation-Id header');
    const access = canForOrg(actor, orgId, 'inspection.create');
    if (!access.ok) {
      if (access.code === 'organisation_not_approved') throw new Problem(403, 'organisation_not_approved', 'Forbidden', 'Your business has not been approved yet');
      throw new Problem(403, 'forbidden', 'Forbidden', 'You cannot do this for this organisation');
    }
    const type = access.membership?.organisationType ?? (await this.iam.organisation(orgId))?.type;
    if (!type || !INSPECTOR_TYPES.includes(type)) throw new Problem(403, 'not_an_inspector', 'Forbidden', 'This organisation does not do inspections');
    return orgId;
  }

  /** GET /v1/inspection-bookings?status= — requests to this inspector. */
  @Get('inspection-bookings')
  async forInspector(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('status') status?: string) {
    const org = await this.org(actor, orgId);
    const s = status === undefined ? undefined : z.enum(STATUSES).safeParse(status);
    if (s && !s.success) throw badRequest('invalid_query', 'Unknown status');
    return { items: await this.bookings.forOrganisation(org, s?.data) };
  }

  /** POST /v1/inspection-bookings/:id/decision — accept with a time, decline with a reason, or mark done. */
  @Post('inspection-bookings/:id/decision')
  @HttpCode(200)
  async decide(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const parsed = Decision.safeParse(body);
    if (!parsed.success) throw badRequest('invalid_decision', 'Accept needs a date and time; decline needs a reason', parsed.error.issues);
    return this.bookings.decide(actor, org, id, parsed.data).catch(problem);
  }
}
