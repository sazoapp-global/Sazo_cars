import { Body, Controller, Get, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest } from '../../platform/problem.js';
import type { Actor } from './actor.js';
import { CurrentActor, Public } from './auth.guard.js';
import { AuthError, AuthService } from './auth.service.js';

const Phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, e.g. +256772123456');

function toProblem(err: unknown): never {
  if (err instanceof AuthError) {
    const status = err.code === 'rate_limited' ? 429 : err.code === 'display_name_required' ? 400 : err.code === 'refresh_in_progress' ? 409 : 401;
    throw new Problem(status, err.code, ({ 429: 'Too many requests', 400: 'Invalid request', 409: 'Conflict' } as Record<number, string>)[status] ?? 'Unauthorized', err.message);
  }
  throw err;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw badRequest('invalid_request', 'Check the fields', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** POST /v1/auth/otp/request — always 202 (no account discovery). */
  @Public()
  @Post('auth/otp/request')
  @HttpCode(202)
  async requestOtp(@Body() body: unknown) {
    const { phone } = parse(z.object({ phone: Phone }), body);
    await this.auth.requestOtp(phone).catch(toProblem);
    return { status: 'sent' };
  }

  /** POST /v1/auth/otp/verify */
  @Public()
  @Post('auth/otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() body: unknown, @Headers('user-agent') ua?: string) {
    const b = parse(z.object({ phone: Phone, code: z.string().regex(/^[0-9]{6}$/), displayName: z.string().max(120).optional() }), body);
    const { created: _created, ...tokens } = await this.auth.verifyOtp(b.phone, b.code, b.displayName, ua).catch(toProblem);
    return tokens;
  }

  /** POST /v1/auth/password/sign-in — not offered in the MVP (phone codes only). */
  @Public()
  @Post('auth/password/sign-in')
  passwordSignIn() {
    throw new Problem(501, 'not_implemented', 'Not implemented', 'Password sign-in is not available yet; use a phone code');
  }

  /** POST /v1/auth/refresh — rotates the refresh token. */
  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown) {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(20) }), body);
    return this.auth.refresh(refreshToken).catch(toProblem);
  }

  /** POST /v1/auth/sign-out */
  @Post('auth/sign-out')
  @HttpCode(204)
  async signOut(@CurrentActor() actor: Actor) {
    await this.auth.signOut(actor.sessionId);
  }

  /** GET /v1/me */
  @Get('me')
  me(@CurrentActor() actor: Actor) {
    return {
      id: actor.userId,
      displayName: actor.displayName,
      platformRoles: actor.platformRoles,
      memberships: actor.memberships.map((m) => ({
        organisationId: m.organisationId,
        organisationName: m.organisationName,
        organisationType: m.organisationType,
        organisationStatus: m.organisationStatus,
        role: m.role,
        status: m.status,
      })),
    };
  }
}
