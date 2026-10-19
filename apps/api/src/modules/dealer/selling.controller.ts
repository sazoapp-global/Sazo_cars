// Dealership selling API (D-125 step 2): the dealer's car links and enquiries (X-Organisation-Id), and the
// public car page that a shared link opens (no sign-in).
import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Inject, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { tidyName, tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { BrokersService, CurrentActor, IamService, Public, type Actor } from '../iam/index.js';
import { dealerOrg } from './dealer-access.js';
import { LEAD_SOURCES, LEAD_STAGES, LINK_CHANNELS, type LinkRow } from './selling.repository.js';
import { SellingError, SellingService } from './selling.service.js';

const Uuid = z.string().uuid();
const Phone = z.string().regex(/^\+[1-9]\d{7,14}$/, 'a phone number in international form, e.g. +256772123456');
const Name = z.string().trim().min(2).max(80).transform(tidyName);
const STATUS: Record<string, number> = {
  link_not_found: 404, lead_not_found: 404, stock_not_found: 404, car_not_available: 410, car_not_linked: 409, stage_conflict: 409, lead_closed: 409,
  sale_price_required: 400, consent_required: 400, too_many: 429, no_decision_needed: 409, commission_not_found: 404, commission_state: 409, split_needs_two_brokers: 400,
};
const TITLE: Record<number, string> = { 400: 'Invalid request', 404: 'Not found', 409: 'Conflict', 410: 'Gone', 429: 'Too many requests' };

export function sellingProblem(err: unknown): never {
  if (err instanceof SellingError) {
    const status = STATUS[err.code] ?? 422;
    throw new Problem(status, err.code, TITLE[status] ?? 'Unprocessable', err.message);
  }
  throw err;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const b = schema.safeParse(body);
  if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
  return b.data;
}

export const linkView = (l: LinkRow) => ({ linkId: l.id, channel: l.channel, showDealerName: l.showDealerName, createdAt: new Date(l.createdAt).toISOString() });

@Controller('dealer')
export class SellingController {
  constructor(@Inject(SellingService) private readonly selling: SellingService, @Inject(IamService) private readonly iam: IamService) {}

  private id(id: string, code: 'stock_not_found' | 'lead_not_found' | 'link_not_found') {
    if (!Uuid.safeParse(id).success) sellingProblem(new SellingError(code, 'Not found'));
    return id;
  }

  /** POST /v1/dealer/stock/:id/links: a link to share; the token is shown once. */
  @Post('stock/:id/links')
  async createLink(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await dealerOrg(this.iam, actor, orgId);
    const b = parse(z.object({ channel: z.enum(LINK_CHANNELS), showDealerName: z.boolean().default(true) }), body);
    const { link, token } = await this.selling.createLink(actor, org, this.id(id, 'stock_not_found'), b).catch(sellingProblem);
    return { ...linkView(link), token, path: `/c/${token}` };
  }

  @Get('stock/:id/links')
  async links(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await dealerOrg(this.iam, actor, orgId);
    return { items: (await this.selling.dealerLinks(org, this.id(id, 'stock_not_found')).catch(sellingProblem)).map(linkView) };
  }

  /** DELETE /v1/dealer/links/:linkId: the link stops working at once. */
  @Delete('links/:linkId')
  @HttpCode(204)
  async revoke(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('linkId') linkId: string) {
    const org = await dealerOrg(this.iam, actor, orgId);
    await this.selling.revokeLink(org, this.id(linkId, 'link_not_found')).catch(sellingProblem);
  }

  /** GET /v1/dealer/leads?stage=open|closed|<stage>: enquiries with the customer's details (this dealer's staff only). */
  @Get('leads')
  async leads(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Query('stage') stage?: string) {
    const org = await dealerOrg(this.iam, actor, orgId);
    const stages = stage === undefined ? undefined : stage === 'open' ? ['enquiry', 'viewing', 'negotiation', 'deposit', 'handover'] as const
      : stage === 'closed' ? ['completed', 'lost'] as const : z.enum(LEAD_STAGES).safeParse(stage).success ? [stage as (typeof LEAD_STAGES)[number]] : null;
    if (stages === null) throw badRequest('invalid_query', 'Unknown stage');
    const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
    const [rows, bySource] = await Promise.all([this.selling.leads(org, stages ? [...stages] : undefined), this.selling.bySource(org, since)]);
    return { items: await this.selling.leadViews(rows), thisMonthBySource: bySource };
  }

  /** POST /v1/dealer/leads: an enquiry added by staff (walk-in, phone call, a WhatsApp message). */
  @Post('leads')
  async addLead(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Body() body: unknown) {
    const org = await dealerOrg(this.iam, actor, orgId);
    const b = parse(z.object({ stockId: Uuid.optional(), name: Name, phone: Phone, source: z.enum(LEAD_SOURCES).exclude(['broker']),
      message: z.string().trim().max(500).transform(tidySentence).optional(), consent: z.boolean() }), body);
    const lead = await this.selling.addLead(actor, org, b).catch(sellingProblem);
    return (await this.selling.leadViews([lead]))[0];
  }

  /** PATCH /v1/dealer/leads/:id: move to another stage (completed needs the private selling price). */
  @Patch('leads/:id')
  async move(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await dealerOrg(this.iam, actor, orgId);
    const b = parse(z.object({ stage: z.enum(LEAD_STAGES), salePriceUgx: z.number().int().positive().max(100_000_000_000).optional(),
      note: z.string().trim().max(500).transform(tidySentence).optional() }), body);
    const lead = await this.selling.moveStage(actor, org, this.id(id, 'lead_not_found'), b.stage, b).catch(sellingProblem);
    return (await this.selling.leadViews([lead]))[0];
  }

  /** POST /v1/dealer/leads/:id/notes */
  @Post('leads/:id/notes')
  @HttpCode(204)
  async note(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await dealerOrg(this.iam, actor, orgId);
    const { note } = parse(z.object({ note: z.string().trim().min(2).max(500).transform(tidySentence) }), body);
    await this.selling.addNote(actor, org, this.id(id, 'lead_not_found'), note).catch(sellingProblem);
  }

  /** GET /v1/dealer/leads/:id/events: what happened to the enquiry, in order. */
  @Get('leads/:id/events')
  async events(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string) {
    const org = await dealerOrg(this.iam, actor, orgId);
    const lead = await this.selling.lead(org, this.id(id, 'lead_not_found')).catch(sellingProblem);
    const events = await this.selling.events(lead.id);
    const names = await this.iam.firstNames(events.map((e) => e.actorUserId).filter((x): x is string => !!x));
    return { items: events.map((e) => ({ kind: e.kind, fromStage: e.fromStage, toStage: e.toStage, note: e.note, by: e.actorUserId ? names.get(e.actorUserId) ?? null : null, at: new Date(e.at).toISOString() })) };
  }
}

@Controller('dealer')
export class DealerCommissionsController {
  constructor(@Inject(SellingService) private readonly selling: SellingService, @Inject(IamService) private readonly iam: IamService) {}

  /** POST /v1/dealer/leads/:id/decision: who brought a customer two people claimed (D-128). Managers only. */
  @Post('leads/:id/decision')
  @HttpCode(200)
  async decide(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    const org = await dealerOrg(this.iam, actor, orgId, 'dealer.costs.manage');
    if (!Uuid.safeParse(id).success) sellingProblem(new SellingError('lead_not_found', 'No such enquiry'));
    const b = parse(z.object({ outcome: z.enum(['keep', 'earlier', 'split', 'dealer']), reason: z.string().trim().min(3).max(300).transform(tidySentence),
      splitPercent: z.number().int().min(1).max(99).optional() }), body);
    const lead = await this.selling.decide(actor, org, id, b).catch(sellingProblem);
    return (await this.selling.leadViews([lead]))[0];
  }

  /** GET /v1/dealer/commissions: commission records for this dealer's sales (managers). */
  @Get('commissions')
  async list(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined) {
    const org = await dealerOrg(this.iam, actor, orgId, 'dealer.costs.manage');
    const rows = await this.selling.commissions(org);
    const names = await this.iam.firstNames(rows.map((r) => r.brokerUserId));
    return { items: rows.map((c) => ({ commissionId: c.id, leadId: c.leadId, stockId: c.stockItemId, broker: names.get(c.brokerUserId) ?? 'A broker', status: c.status,
      kind: c.kind, percent: c.percent, salePriceUgx: c.salePriceUgx, sharePercent: c.sharePercent, amountUgx: c.amountUgx, paidReference: c.paidReference,
      createdAt: new Date(c.createdAt).toISOString() })) };
  }

  /** POST /v1/dealer/commissions/:id/approve | paid | cancel (a note: the payment reference, or why it was cancelled). */
  @Post('commissions/:id/:action')
  @HttpCode(200)
  async act(@CurrentActor() actor: Actor, @Headers('x-organisation-id') orgId: string | undefined, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown) {
    const org = await dealerOrg(this.iam, actor, orgId, 'dealer.costs.manage');
    const a = z.enum(['approve', 'paid', 'cancel']).safeParse(action);
    if (!a.success || !Uuid.safeParse(id).success) throw notFound('commission_not_found', 'No such commission');
    const { note } = parse(z.object({ note: z.string().trim().max(200).transform(tidySentence).optional() }), body ?? {});
    if (a.data === 'cancel' && !note) throw badRequest('reason_required', 'Say why the commission is cancelled');
    const c = await this.selling.commissionAction(actor, org, id, a.data, note).catch(sellingProblem);
    return { commissionId: c.id, status: c.status, amountUgx: c.amountUgx, paidReference: c.paidReference };
  }
}

/** The public car page a shared link opens. No sign-in; nothing about the dealer's business beyond its name. */
@Controller('cars')
export class PublicCarController {
  constructor(@Inject(SellingService) private readonly selling: SellingService, @Inject(BrokersService) private readonly brokers: BrokersService) {}

  @Public()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  async car(@Param('token') token: string) {
    return this.selling.publicCar(token, (id) => this.brokers.contact(id)).catch(sellingProblem);
  }

  @Public()
  @Get(':token/photos/:photoId')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  @Header('Cache-Control', 'public, max-age=600')
  async photo(@Param('token') token: string, @Param('photoId') photoId: string) {
    if (!Uuid.safeParse(photoId).success) throw notFound('photo_not_found', 'No such photo');
    const f = await this.selling.publicPhoto(token, photoId).catch(sellingProblem);
    if (!f) throw notFound('photo_not_found', 'No such photo');
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline', length: f.bytes.length });
  }

  /** POST /v1/cars/:token/enquiries: the customer leaves a name and number and agrees to be contacted. */
  @Public()
  @Post(':token/enquiries')
  async enquire(@Param('token') token: string, @Body() body: unknown) {
    const b = parse(z.object({ name: Name, phone: Phone, consent: z.boolean(), message: z.string().trim().max(500).transform(tidySentence).optional() }), body);
    return this.selling.enquire(token, b).catch(sellingProblem);
  }
}
