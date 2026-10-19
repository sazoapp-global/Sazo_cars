// Broker API (D-121, D-127): applying with a National ID, the marketplace of cars open to brokers, the
// broker's own links, enquiries and commission statement; and the SAZO admin check of applications.
import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { tidySentence } from '@sazo/contracts';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { BrokerApplicationError, BrokersService, CurrentActor, RequirePermission, type Actor } from '../iam/index.js';
import { BrokerError, BrokerService } from './broker.service.js';
import { linkView, sellingProblem } from './selling.controller.js';
import { LINK_CHANNELS } from './selling.repository.js';

const Uuid = z.string().uuid();
/** Uganda National ID number: 14 characters, CM (male) or CF (female) then letters and digits. */
export const NIN = z.string().trim().toUpperCase().regex(/^C[MF][A-Z0-9]{12}$/, 'a National ID number has 14 characters and starts with CM or CF');

function brokerProblem(err: unknown): never {
  if (err instanceof BrokerApplicationError) {
    const status = ({ profile_incomplete: 409, already_applied: 409, nin_in_use: 409, application_not_found: 404, already_decided: 409 } as const)[err.code];
    throw new Problem(status, err.code, status === 404 ? 'Not found' : 'Conflict', err.message);
  }
  if (err instanceof BrokerError) throw new Problem(err.code === 'car_not_open' ? 404 : 422, err.code, err.code === 'car_not_open' ? 'Not found' : 'Unprocessable', err.message);
  return sellingProblem(err);
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const b = schema.safeParse(body);
  if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
  return b.data;
}

@Controller('broker')
export class BrokerController {
  constructor(@Inject(BrokerService) private readonly broker: BrokerService, @Inject(BrokersService) private readonly brokers: BrokersService) {}

  /** GET /v1/broker/application: the person's latest application and whether they are a broker now. */
  @Get('application')
  async application(@CurrentActor() actor: Actor) {
    const a = await this.brokers.mine(actor.userId);
    return { isBroker: actor.permissions.has('broker.access'), application: a ? { status: a.status, decisionReason: a.decisionReason, createdAt: a.createdAt, decidedAt: a.decidedAt } : null };
  }

  /** POST /v1/broker/application: National ID number and a photo of the ID (D-127). */
  @Post('application')
  async apply(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = parse(z.object({ nin: NIN, idPhotoEvidenceId: Uuid }), body);
    const a = await this.broker.apply(actor, b.nin, b.idPhotoEvidenceId).catch(brokerProblem);
    return { status: a.status, createdAt: a.createdAt };
  }

  @Get('cars')
  @RequirePermission('broker.access')
  async cars() {
    return { items: await this.broker.cars() };
  }

  @Get('cars/:stockId/photos/:photoId')
  @RequirePermission('broker.access')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
  @Header('Cache-Control', 'private, max-age=600')
  async photo(@Param('stockId') stockId: string, @Param('photoId') photoId: string) {
    if (!Uuid.safeParse(stockId).success || !Uuid.safeParse(photoId).success) throw notFound('photo_not_found', 'No such photo');
    const f = await this.broker.photo(stockId, photoId).catch(brokerProblem);
    if (!f) throw notFound('photo_not_found', 'No such photo');
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline', length: f.bytes.length });
  }

  /** POST /v1/broker/cars/:stockId/links: the broker's own link; enquiries through it are registered to them. */
  @Post('cars/:stockId/links')
  @RequirePermission('broker.access')
  async createLink(@CurrentActor() actor: Actor, @Param('stockId') stockId: string, @Body() body: unknown) {
    if (!Uuid.safeParse(stockId).success) throw notFound('car_not_open', 'This car is not open to brokers');
    const { channel } = parse(z.object({ channel: z.enum(LINK_CHANNELS) }), body);
    const { link, token } = await this.broker.createLink(actor, stockId, channel).catch(brokerProblem);
    return { ...linkView(link), token, path: `/c/${token}` };
  }

  @Get('links')
  @RequirePermission('broker.access')
  async links(@CurrentActor() actor: Actor) {
    return { items: await this.broker.links(actor) };
  }

  @Delete('links/:linkId')
  @HttpCode(204)
  @RequirePermission('broker.access')
  async revoke(@CurrentActor() actor: Actor, @Param('linkId') linkId: string) {
    if (!Uuid.safeParse(linkId).success) throw notFound('link_not_found', 'No such link');
    await this.broker.revokeLink(actor, linkId).catch(brokerProblem);
  }

  @Get('enquiries')
  @RequirePermission('broker.access')
  async enquiries(@CurrentActor() actor: Actor) {
    return { items: await this.broker.enquiries(actor) };
  }

  /** GET /v1/broker/commissions: the broker's statement (records only; no money moves through SAZO). */
  @Get('commissions')
  @RequirePermission('broker.access')
  async commissions(@CurrentActor() actor: Actor) {
    return this.broker.commissions(actor);
  }
}

@Controller('admin/brokers')
export class AdminBrokersController {
  constructor(@Inject(BrokersService) private readonly brokers: BrokersService) {}

  /** GET /v1/admin/brokers/applications?status=pending: with the applicant's ID number and ID photo for checking. */
  @Get('applications')
  @RequirePermission('broker.approve')
  async list(@Query('status') status = 'pending') {
    const s = z.enum(['pending', 'approved', 'rejected']).safeParse(status);
    if (!s.success) throw badRequest('invalid_query', 'Unknown status');
    return { items: await this.brokers.list(s.data) };
  }

  @Post('applications/:id/decision')
  @HttpCode(200)
  @RequirePermission('broker.approve')
  async decide(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    if (!Uuid.safeParse(id).success) throw notFound('application_not_found', 'No such application');
    const b = parse(z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().min(3).max(300).transform(tidySentence) }), body);
    const a = await this.brokers.decide(actor, id, b.decision, b.reason).catch(brokerProblem);
    return { status: a.status, decisionReason: a.decisionReason };
  }
}
