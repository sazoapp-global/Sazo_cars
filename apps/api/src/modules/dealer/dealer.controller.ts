// Dealer workspace API. Every call acts for one dealer: X-Organisation-Id header. Costs, margins, commission
// terms and dealer settings need dealer.costs.manage (managers); sales staff manage cars and prices.
import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Inject, Param, Patch, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { tidyName, tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { canForOrg, CurrentActor, IamService, type Actor } from '../iam/index.js';
import { COST_CATEGORIES, CUSTOMS_STATUSES, IMPORT_STAGES } from './dealer.repository.js';
import { dealerOrg, type DealerPermission } from './dealer-access.js';
import { DealerError, DealerService } from './dealer.service.js';

const Uuid = z.string().uuid();
const Price = z.number().int().positive().max(100_000_000_000);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), 'not a date');
const thisYear = new Date().getUTCFullYear();
const Details = z.object({
  make: z.string().trim().min(2).max(40).transform(tidyName).nullable(),
  model: z.string().trim().min(1).max(60).transform(tidyName).nullable(),
  modelYear: z.number().int().min(1950).max(thisYear + 1).nullable(),
  engineCc: z.number().int().min(50).max(20000).nullable(),
  fuel: z.enum(['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other']).nullable(),
  transmission: z.enum(['manual', 'automatic', 'cvt', 'other']).nullable(),
  colour: z.string().trim().min(2).max(30).transform(tidyName).nullable(),
  yard: z.string().trim().min(2).max(80).transform(tidyName).nullable(),
  stage: z.enum(IMPORT_STAGES),
  receivedOn: Day.nullable(),
  bondArrivedOn: Day.nullable(),
  customsStatus: z.enum(CUSTOMS_STATUSES).nullable(),
  customsDeadline: Day.nullable(),
  customsExtensionUntil: Day.nullable(),
  customsValueUgx: Price.nullable(),
  tiktokUrl: z.string().trim().url().max(300).refine((u) => /^https:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\//i.test(u), 'must be a TikTok link').nullable(),
  openToBrokers: z.boolean(),
  commissionKind: z.enum(['fixed', 'percent']).nullable(),
  commissionFixedUgx: Price.nullable(),
  commissionPercent: z.number().positive().max(20).multipleOf(0.01).nullable(),
}).partial().strict();
const Add = z.object({
  vehicleRef: z.string().regex(/^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/).optional(),
  plate: z.string().trim().min(2).max(15).optional(),
  vin: z.string().trim().min(5).max(30).optional(),
  chassisNumber: z.string().trim().min(5).max(30).optional(),
  askingPriceUgx: Price,
  mileageKm: z.number().int().min(0).max(2_000_000).optional(),
  odometerPhotoId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).transform(tidySentence).optional(),
  details: Details.optional(),
});
const Link = z.object({
  vehicleRef: Add.shape.vehicleRef, plate: Add.shape.plate, vin: Add.shape.vin, chassisNumber: Add.shape.chassisNumber,
  mileageKm: Add.shape.mileageKm, odometerPhotoId: Add.shape.odometerPhotoId,
});
const Cost = z.object({
  category: z.enum(COST_CATEGORIES),
  amount: z.number().positive().max(1e13).multipleOf(0.01),
  currency: z.string().regex(/^[A-Z]{3}$/).default('UGX'),
  rateToUgx: z.number().positive().max(1e7).optional(),
  note: z.string().trim().max(300).transform(tidySentence).optional(),
  shareRule: z.string().trim().max(200).transform(tidySentence).optional(),
}).refine((c) => c.currency === 'UGX' || c.rateToUgx !== undefined, { message: 'rateToUgx is needed for a cost not in UGX', path: ['rateToUgx'] });
const Settings = z.object({
  stockAgeAlertDays: z.array(z.number().int().min(1).max(3650)).min(1).max(5),
  leadProtectionDays: z.number().int().min(1).max(365),
  whatsappE164: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().default(null),
});

const STATUS: Record<string, number> = {
  stock_not_found: 404, vehicle_not_found: 404, cost_not_found: 404, photo_not_found: 404, identifiers_required: 400, make_required: 400, link_first: 400, rate_required: 400,
  commission_incomplete: 400, odometer_photo_required: 422, photo_not_allowed: 422, too_many_photos: 422, too_many_listings: 429, already_in_stock: 409, not_in_stock: 409,
  already_linked: 409, already_reversed: 409, costs_locked: 409, waiting_for_review: 409, listing_rejected: 422, organisation_not_approved: 403,
};
const TITLE: Record<number, string> = { 400: 'Invalid request', 403: 'Forbidden', 404: 'Not found', 409: 'Conflict', 422: 'Unprocessable', 429: 'Too many requests' };

function problem(err: unknown): never {
  if (err instanceof DealerError) {
    const status = STATUS[err.code] ?? 422;
    throw new Problem(status, err.code, TITLE[status]!, err.message, err.details);
  }
  throw err;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const b = schema.safeParse(body);
  if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
  return b.data;
}

@Controller('dealer')
export class DealerController {
  constructor(@Inject(DealerService) private readonly dealer: DealerService, @Inject(IamService) private readonly iam: IamService) {}

  private org(actor: Actor, orgId: string | undefined, permission: DealerPermission = 'dealer.stock.manage'): Promise<string> {
    return dealerOrg(this.iam, actor, orgId, permission);
  }

  private canManage(actor: Actor, orgId: string) {
    return canForOrg(actor, orgId, 'dealer.costs.manage').ok;
  }

  private id(id: string) {
    if (!Uuid.safeParse(id).success) problem(new DealerError('stock_not_found', 'No such car in your stock'));
    return id;
  }

  private async one(actor: Actor, org: string, row: Parameters<DealerService['view']>[0]) {
    return (await this.dealer.views([row], org, this.canManage(actor, org)))[0]!;
  }

  /** GET /v1/dealer/stock?status= */
  @Get('stock')
  async list(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('status') status?: string) {
    const org = await this.org(actor, orgId);
    const s = status === undefined ? undefined : z.enum(['in_stock', 'sold', 'removed']).safeParse(status);
    if (s && !s.success) throw badRequest('invalid_query', 'Unknown status');
    return { items: await this.dealer.views(await this.dealer.list(org, s?.data), org, this.canManage(actor, org)) };
  }

  /**
   * POST /v1/dealer/stock: add a car. With a reference, VIN or chassis number it joins the car's history at once;
   * with only its details (make, model...) it waits until the chassis number is added (POST .../link).
   */
  @Post('stock')
  async add(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const b = parse(Add, body);
    if (b.details && !this.canManage(actor, org)) { delete b.details.commissionKind; delete b.details.commissionFixedUgx; delete b.details.commissionPercent; delete b.details.customsValueUgx; }
    return this.one(actor, org, await this.dealer.add(actor, org, b).catch(problem));
  }

  /** GET /v1/dealer/stock/:id */
  @Get('stock/:id')
  async get(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await this.org(actor, orgId);
    return this.one(actor, org, await this.dealer.get(org, this.id(id)).catch(problem));
  }

  /** PATCH /v1/dealer/stock/:id: a new asking price and/or changed details (stage, clocks, broker switch, commission). */
  @Patch('stock/:id')
  async update(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const b = parse(z.object({ askingPriceUgx: Price.optional(), details: Details.optional() }).refine((x) => x.askingPriceUgx !== undefined || x.details, 'nothing to change'), body);
    let row = await this.dealer.get(org, this.id(id)).catch(problem);
    if (b.askingPriceUgx !== undefined) row = await this.dealer.changePrice(actor, org, row.id, b.askingPriceUgx).catch(problem);
    if (b.details) row = await this.dealer.updateDetails(actor, org, row.id, b.details, this.canManage(actor, org)).catch(problem);
    return this.one(actor, org, row);
  }

  /** POST /v1/dealer/stock/:id/link: add the chassis number (or VIN) of a car added without it. */
  @Post('stock/:id/link')
  @HttpCode(200)
  async link(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    return this.one(actor, org, await this.dealer.link(actor, org, this.id(id), parse(Link, body)).catch(problem));
  }

  /** POST /v1/dealer/stock/:id/sold: the sale price stays confidential. */
  @Post('stock/:id/sold')
  @HttpCode(200)
  async sold(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const today = new Date().toISOString().slice(0, 10);
    const b = z.object({ salePriceUgx: Price, soldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => d <= today, 'cannot be in the future').default(today) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'salePriceUgx is required; soldOn must be a past date (YYYY-MM-DD)');
    return this.one(actor, org, await this.dealer.markSold(actor, org, this.id(id), b.data.salePriceUgx, b.data.soldOn).catch(problem));
  }

  /** DELETE /v1/dealer/stock/:id: taken off sale without a sale (nothing is added to the car's history). */
  @Delete('stock/:id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await this.org(actor, orgId);
    await this.dealer.remove(org, this.id(id)).catch(problem);
  }

  // Costs (managers) -------------------------------------------------------------------------------------

  /** GET /v1/dealer/stock/:id/costs: the cost ledger with its total in UGX. */
  @Get('stock/:id/costs')
  async costs(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await this.org(actor, orgId, 'dealer.costs.manage');
    const c = await this.dealer.costs(org, this.id(id)).catch(problem);
    return { totalUgx: c.totalUgx, entries: c.entries.map(({ createdBy: _c, ...e }) => ({ ...e, createdAt: new Date(e.createdAt).toISOString() })) };
  }

  /** POST /v1/dealer/stock/:id/costs: one cost in its own currency with the rate used. */
  @Post('stock/:id/costs')
  async addCost(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'dealer.costs.manage');
    const e = await this.dealer.addCost(actor, org, this.id(id), parse(Cost, body)).catch(problem);
    const { createdBy: _c, ...rest } = e;
    return { ...rest, createdAt: new Date(e.createdAt).toISOString() };
  }

  /** POST /v1/dealer/stock/:id/costs/:entryId/reverse: cancel a cost with a reason; both entries stay. */
  @Post('stock/:id/costs/:entryId/reverse')
  async reverseCost(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Param('entryId') entryId: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'dealer.costs.manage');
    if (!Uuid.safeParse(entryId).success) problem(new DealerError('cost_not_found', 'No such cost on this car'));
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300).transform(tidySentence) }), body);
    const e = await this.dealer.reverseCost(actor, org, this.id(id), entryId, reason).catch(problem);
    const { createdBy: _c, ...rest } = e;
    return { ...rest, createdAt: new Date(e.createdAt).toISOString() };
  }

  // Photos -----------------------------------------------------------------------------------------------

  /** POST /v1/dealer/stock/:id/photos: attach a vehicle photo uploaded by someone at this dealer. */
  @Post('stock/:id/photos')
  async addPhoto(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await this.org(actor, orgId);
    const { evidenceId } = parse(z.object({ evidenceId: z.string().uuid() }), body);
    const p = await this.dealer.addPhoto(actor, org, this.id(id), evidenceId).catch(problem);
    return { photoId: p.id, position: p.position };
  }

  @Delete('stock/:id/photos/:photoId')
  @HttpCode(204)
  async removePhoto(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Param('photoId') photoId: string) {
    const org = await this.org(actor, orgId);
    if (!Uuid.safeParse(photoId).success) problem(new DealerError('photo_not_found', 'No such photo'));
    await this.dealer.removePhoto(org, this.id(id), photoId).catch(problem);
  }

  /** GET /v1/dealer/stock/:id/photos/:photoId: the image, for this dealer's staff. */
  @Get('stock/:id/photos/:photoId')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  @Header('Cache-Control', 'private, max-age=3600')
  async photo(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Param('photoId') photoId: string) {
    const org = await this.org(actor, orgId);
    if (!Uuid.safeParse(photoId).success) throw notFound('photo_not_found', 'No such photo');
    const row = await this.dealer.get(org, this.id(id)).catch(problem);
    const f = await this.dealer.photoContent(row.id, photoId);
    if (!f) throw notFound('photo_not_found', 'No such photo');
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline', length: f.bytes.length });
  }

  // Settings (managers) ----------------------------------------------------------------------------------

  /** GET /v1/dealer/settings: stock age alert levels and the broker lead protection period. */
  @Get('settings')
  async settings(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined) {
    const org = await this.org(actor, orgId);
    return this.dealer.settings(org);
  }

  @Put('settings')
  async saveSettings(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Body() body: unknown) {
    const org = await this.org(actor, orgId, 'dealer.costs.manage');
    return this.dealer.saveSettings(actor, org, parse(Settings, body));
  }
}
