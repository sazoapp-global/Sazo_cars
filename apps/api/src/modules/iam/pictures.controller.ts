// Business logos and personal photos (D-186, 15 Nov 2026). The web makes the picture square and small before it
// is sent; the API checks it is a picture and keeps it. Logos show at once, with no check by SAZO, and every
// change is kept (iam.organisation_logos is append only). Photos are for people in a business and for brokers.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, StreamableFile } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import type { Actor } from './actor.js';
import { CurrentActor, Public } from './auth.guard.js';
import { IamService } from './iam.service.js';

const Picture = z.object({ image: z.string().min(16).max(130_000), mime: z.enum(['image/webp', 'image/jpeg', 'image/png']) }).strict();
const Uuid = z.string().uuid();

/** The bytes, if they really are a WebP, JPEG or PNG picture of the type given. */
function picture(body: unknown): { bytes: Buffer; mime: string } {
  const p = Picture.safeParse(body);
  if (!p.success) throw badRequest('invalid_request', 'Send a picture: image (base64) and mime');
  const bytes = Buffer.from(p.data.image, 'base64');
  const is = {
    'image/webp': bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP',
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  }[p.data.mime];
  if (!is) throw new Problem(422, 'not_a_picture', 'Unprocessable', 'This is not a JPG, PNG or WebP picture');
  if (bytes.length > 96_000) throw new Problem(422, 'picture_too_big', 'Unprocessable', 'This picture is too big');
  return { bytes, mime: p.data.mime };
}

@Controller()
export class PicturesController {
  constructor(@Inject(IamService) private readonly iam: IamService) {}

  private manager(actor: Actor, id: string) {
    const ok = Uuid.safeParse(id).success && actor.memberships.some((m) => m.organisationId === id && m.status === 'active' && m.role === 'org_manager');
    if (!ok) throw notFound('organisation_not_found', 'No such organisation');
  }

  /** PUT /v1/organisations/:id/logo { image, mime }: a manager adds or changes the logo. */
  @Put('organisations/:id/logo')
  async setLogo(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    this.manager(actor, id);
    return this.iam.setLogo(actor, id, picture(body));
  }

  /** DELETE /v1/organisations/:id/logo: a manager removes it (kept on record). */
  @Delete('organisations/:id/logo')
  @HttpCode(200)
  async removeLogo(@CurrentActor() actor: Actor, @Param('id') id: string) {
    this.manager(actor, id);
    const r = await this.iam.setLogo(actor, id, null);
    if (r === 'no_logo') throw new Problem(409, 'no_logo', 'Conflict', 'This business has no logo');
    return r;
  }

  /** GET /v1/organisations/:id/logo/history: who changed the logo and when, newest first (managers). */
  @Get('organisations/:id/logo/history')
  async logoHistory(@CurrentActor() actor: Actor, @Param('id') id: string) {
    this.manager(actor, id);
    return { items: await this.iam.logoHistory(id) };
  }

  /** PUT /v1/me/photo { image, mime }: your photo, for people in a business and for brokers. */
  @Put('me/photo')
  async setPhoto(@CurrentActor() actor: Actor, @Body() body: unknown) {
    if (!this.iam.canHavePhoto(actor)) throw new Problem(403, 'photo_not_allowed', 'Forbidden', 'Photos are for people who work in a business on SAZO and for brokers');
    return this.iam.setPhoto(actor, picture(body));
  }

  /** DELETE /v1/me/photo: back to your initials. The photo is deleted. */
  @Delete('me/photo')
  @HttpCode(200)
  async removePhoto(@CurrentActor() actor: Actor) {
    return this.iam.setPhoto(actor, null);
  }

  /**
   * GET /v1/pictures/:id: a logo or a photo. Ids are only given out where the picture shows, and a new picture
   * gets a new id, so it may be kept for a long time. A removed photo is gone; logos stay for the record.
   */
  @Public()
  @Get('pictures/:id')
  async picture(@Param('id') id: string) {
    const p = Uuid.safeParse(id).success ? await this.iam.picture(id) : undefined;
    if (!p) throw notFound('picture_not_found', 'No such picture');
    return new StreamableFile(p.bytes, { type: p.mime, disposition: 'inline', length: p.bytes.length });
  }
}
