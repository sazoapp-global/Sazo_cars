// Account settings API: name, phone number, texts, devices, download my data, delete my account.
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { AuthError, AuthService, CurrentActor, IamService, type Actor } from '../iam/index.js';
import { AccountError, AccountService } from './account.service.js';

const Phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, e.g. +256772123456');

function problem(err: unknown): never {
  if (err instanceof AuthError) {
    const status = ({ rate_limited: 429, invalid_code: 422, phone_in_use: 409, same_phone: 400 } as Record<string, number>)[err.code] ?? 400;
    throw new Problem(status, err.code, status === 429 ? 'Too many requests' : status === 409 ? 'Conflict' : status === 422 ? 'Unprocessable' : 'Invalid request', err.message);
  }
  if (err instanceof AccountError) throw new Problem(409, err.code, 'Conflict', err.message, err.details);
  throw err;
}

@Controller('me')
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly account: AccountService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /** PATCH /v1/me — change the name SAZO shows (to garages you work with, and on your reviews: first name only). */
  @Patch()
  @HttpCode(204)
  async rename(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = z.object({ displayName: z.string().trim().min(2).max(120) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Your name must be 2–120 characters');
    await this.iam.rename(actor, b.data.displayName);
  }

  /** POST /v1/me/phone/code — send a code to the NEW number. */
  @Post('phone/code')
  @HttpCode(202)
  async phoneCode(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = z.object({ phone: Phone }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Use international format, e.g. +256772123456');
    await this.auth.requestPhoneChange(actor.userId, b.data.phone).catch(problem);
    return { status: 'sent' };
  }

  /** POST /v1/me/phone — confirm with the code; other devices are signed out and the old number is told. */
  @Post('phone')
  @HttpCode(204)
  async changePhone(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = z.object({ phone: Phone, code: z.string().regex(/^\d{6}$/) }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Give the new number and the 6-digit code');
    await this.auth.confirmPhoneChange(actor.userId, actor.sessionId, b.data.phone, b.data.code).catch(problem);
  }

  /** GET /v1/me/profile — name, phone number and businesses, for the account screen. */
  @Get('profile')
  profile(@CurrentActor() actor: Actor) {
    return this.iam.profile(actor.userId);
  }

  @Get('preferences')
  preferences(@CurrentActor() actor: Actor) {
    return this.account.preferences(actor.userId);
  }

  /** PUT /v1/me/preferences — e.g. stop texts asking you to confirm garage visits. */
  @Put('preferences')
  async setPreferences(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = z.object({ visitConfirmationTexts: z.boolean() }).safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'visitConfirmationTexts must be true or false');
    return this.account.setPreferences(actor, b.data);
  }

  /** GET /v1/me/sessions — devices signed in to this account. */
  @Get('sessions')
  async sessions(@CurrentActor() actor: Actor) {
    return { items: await this.iam.devices(actor.userId, actor.sessionId) };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async signOutDevice(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success || !(await this.iam.signOutDevice(actor.userId, id))) throw notFound('session_not_found', 'No such device');
  }

  /** POST /v1/me/sessions/sign-out-others */
  @Post('sessions/sign-out-others')
  async signOutOthers(@CurrentActor() actor: Actor) {
    return { signedOut: await this.iam.signOutOthers(actor.userId, actor.sessionId) };
  }

  /** GET /v1/me/export — download my data (JSON). */
  @Get('export')
  export(@CurrentActor() actor: Actor) {
    return this.account.export(actor);
  }

  /** DELETE /v1/me — delete my account. The body must say DELETE, so it can't happen by accident. */
  @Delete()
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Body() body: unknown) {
    if (!z.object({ confirm: z.literal('DELETE') }).safeParse(body).success) throw badRequest('confirmation_required', 'Send {"confirm":"DELETE"}');
    await this.account.delete(actor).catch(problem);
  }
}
