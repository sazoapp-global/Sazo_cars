// Dealer workspace API. Every call acts for one dealer: X-Organisation-Id header.
import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest } from '../../platform/problem.js';
import { canForOrg, CurrentActor, IamService, type Actor } from '../iam/index.js';
import { DealerError, DealerService } from './dealer.service.js';

const Uuid = z.string().uuid();
const Price = z.number().int().positive().max(100_000_000_000);
const Add = z.object({
  vehicleRef: z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/).optional(),
  plate: z.string().trim().min(2).max(15).optional(),
  vin: z.string().trim().min(5).max(30).optional(),
  chassisNumber: z.string().trim().min(5).max(30).optional(),
  askingPriceUgx: Price,
  mileageKm: z.number().int().min(0).max(2_000_000).optional(),
  odometerPhotoId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
});

function problem(err: unknown): never {
  if (err instanceof DealerError) {
    const status = ({
      stock_not_found: 404, vehicle_not_found: 404, identifiers_required: 400, odometer_photo_required: 422, too_many_listings: 429, already_in_stock: 409, not_in_stock: 409,
      vehicle_needs_review: 422, listing_rejected: 422, organisation_not_approved: 403,
    } as const)[err.code];
    throw new Problem(status, err.code, status === 404 ? 'Not found' : status === 409 ? 'Conflict' : status === 403 ? 'Forbidden' : status === 400 ? 'Invalid request' : status === 429 ? 'Too many requests' : 'Unprocessable', err.message, err.details);
  }
  throw err;
}

@Controller('dealer/stock')
export class DealerController {
  constructor(@Inject(DealerService) private readonly dealer: DealerService, @Inject(IamService) private readonly iam: IamService) {}

  private async org(actor: Actor, orgId: string | undefined): Promise<string> {
    if (!orgId || !Uuid.safeParse(orgId).success) throw badRequest('organisation_required', 'Send the X-Organisation-Id header');
    const access = canForOrg(actor, orgId, 'dealer.stock.manage');
    if (!access.ok) {
      if (access.code === 'organisation_not_approved') throw new Problem(403, 'organisation_not_approved', 'Forbidden', 'Your business has not been approved yet');
      throw new Problem(403, 'forbidden', 'Forbidden', 'You cannot do this for this organisation');
    }
    const type = access.membership?.organisationType ?? (await this.iam.organisation(orgId))?.type;
    if (type !== 'dealer') throw new Problem(403, 'not_a_dealer', 'Forbidden', 'This organisation is not a dealer');
    return orgId;
  }

  private id(id: string) {
    if (!Uuid.safeParse(id).success) problem(new DealerError('stock_not_found', 'No such car in your stock'));
    return id;
  }

  /** GET /v1/dealer/stock?status= */
  @Get()
  async list(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('status') status?: string) {
    const org = await this.org(actor, orgId);
    const s = status === undefined ? undefined : z.enum(['in_stock', 'sold', 'removed']).safeParse(status);
    if (s && !s.success) throw badRequest('invalid_query', 'Unknown status');
    return { items: await Promise.all((await this.dealer.list(org, s?.data)).map((r) => this.dealer.view(r))) };
  }

  /** POST /v1/dealer/stock — list a car for sale (known car by reference, or a new one by VIN/chassis + plate). */
  @Post()
  async add(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const b = Add.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
    return this.dealer.view(await this.dealer.add(actor, org, b.data).catch(problem));
  }

  /** GET /v1/dealer/stock/:id */
  @Get(':id')
  async get(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await this.org(actor, orgId);
    return this.dealer.view(await this.dealer.get(org, this.id(id)).catch(problem));
  }

  /** PATCH /v1/dealer/stock/:id — a new asking price. */
  @Patch(':id')
  async price(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const b = z.object({ askingPriceUgx: Price }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'askingPriceUgx must be a whole number of shillings');
    return this.dealer.view(await this.dealer.changePrice(actor, org, this.id(id), b.data.askingPriceUgx).catch(problem));
  }

  /** POST /v1/dealer/stock/:id/sold — the sale price stays confidential. */
  @Post(':id/sold')
  @HttpCode(200)
  async sold(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const today = new Date().toISOString().slice(0, 10);
    const b = z.object({ salePriceUgx: Price, soldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => d <= today, 'cannot be in the future').default(today) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'salePriceUgx is required; soldOn must be a past date (YYYY-MM-DD)');
    return this.dealer.view(await this.dealer.markSold(actor, org, this.id(id), b.data.salePriceUgx, b.data.soldOn).catch(problem));
  }

  /** DELETE /v1/dealer/stock/:id — taken off sale without a sale (nothing is added to the car's history). */
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await this.org(actor, orgId);
    await this.dealer.remove(org, this.id(id)).catch(problem);
  }
}
