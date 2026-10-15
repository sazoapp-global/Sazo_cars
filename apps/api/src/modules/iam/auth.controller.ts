import { Body, Controller, Get, Headers, HttpCode, Inject, Ip, Post } from '@nestjs/common';
import { Email, PersonDetails } from '@sazo/contracts';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { Problem, badRequest } from '../../platform/problem.js';
import type { Actor } from './actor.js';
import { CurrentActor, Public } from './auth.guard.js';
import { AuthError, AuthService, type LoginContext } from './auth.service.js';

const Phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, e.g. +256772123456');
const Password = z.string().min(1).max(128);
const DeviceToken = z.string().min(20).max(100).optional();

const STATUS: Record<string, number> = {
  rate_limited: 429, signup_details_required: 400, refresh_in_progress: 409, no_account: 404, account_exists: 409, email_in_use: 409,
  account_locked: 423, weak_password: 422, invalid_link: 410, too_young: 422, google_disabled: 503, google_failed: 502, wrong_password: 403,
  details_locked: 409, invalid_code: 401, invalid_credentials: 401, invalid_token: 401, session_idle: 401, account_suspended: 403, phone_in_use: 409, same_phone: 400,
};
const TITLES: Record<number, string> = { 400: 'Invalid request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not found', 409: 'Conflict', 410: 'Gone',
  422: 'Unprocessable', 423: 'Locked', 429: 'Too many requests', 502: 'Bad gateway', 503: 'Unavailable' };

export function authProblem(err: unknown): never {
  if (err instanceof AuthError) {
    const status = STATUS[err.code] ?? 400;
    throw new Problem(status, err.code, TITLES[status] ?? 'Error', err.message, err.details.length ? err.details : undefined);
  }
  throw err;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw badRequest('invalid_request', r.error.issues[0]?.message ?? 'Check the fields', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

const ctxOf = (ua: string | undefined, ip: string | undefined, deviceToken?: string): LoginContext => ({ userAgent: ua, ip: ip ?? null, ...(deviceToken ? { deviceToken } : {}) });

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(APP_CONFIG) private readonly cfg: AppConfig) {}

  /** POST /v1/auth/signup/email — create an account with email and password (D-100). Logs in at once; a link confirms the email. */
  @Public()
  @Post('auth/signup/email')
  @HttpCode(201)
  async signupEmail(@Body() body: unknown, @Headers('user-agent') ua?: string, @Ip() ip?: string) {
    const b = parse(PersonDetails.extend({ email: Email, password: Password }), body);
    const { email, password, ...details } = b;
    return this.auth.signupWithEmail(details, email, password, ctxOf(ua, ip)).catch(authProblem);
  }

  /** POST /v1/auth/otp/request — `login` (default) needs an existing account; `signup` needs a new number. */
  @Public()
  @Post('auth/otp/request')
  @HttpCode(202)
  async requestOtp(@Body() body: unknown) {
    const { phone, intent } = parse(z.object({ phone: Phone, intent: z.enum(['login', 'signup']).default('login') }), body);
    await this.auth.requestOtp(phone, intent).catch(authProblem);
    return { status: 'sent' };
  }

  /** POST /v1/auth/otp/verify — log in with the code; a new number must include `signup` details. */
  @Public()
  @Post('auth/otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() body: unknown, @Headers('user-agent') ua?: string, @Ip() ip?: string) {
    const b = parse(z.object({ phone: Phone, code: z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code'), signup: PersonDetails.optional(), deviceToken: DeviceToken }), body);
    return this.auth.verifyOtp(b.phone, b.code, b.signup, ctxOf(ua, ip, b.deviceToken)).catch(authProblem);
  }

  /** POST /v1/auth/password/sign-in — email and password. */
  @Public()
  @Post('auth/password/sign-in')
  @HttpCode(200)
  async passwordSignIn(@Body() body: unknown, @Headers('user-agent') ua?: string, @Ip() ip?: string) {
    const b = parse(z.object({ email: Email, password: Password, deviceToken: DeviceToken }), body);
    return this.auth.passwordLogin(b.email, b.password, ctxOf(ua, ip, b.deviceToken)).catch(authProblem);
  }

  /** POST /v1/auth/second-step — the code sent to a sensitive role's phone or email on a new device (D-105). */
  @Public()
  @Post('auth/second-step')
  @HttpCode(200)
  async secondStep(@Body() body: unknown, @Headers('user-agent') ua?: string, @Ip() ip?: string) {
    const b = parse(z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code'), rememberDevice: z.boolean().default(true) }), body);
    return this.auth.completeSecondStep(b.challengeId, b.code, b.rememberDevice, ctxOf(ua, ip)).catch(authProblem);
  }

  /** POST /v1/auth/password/forgot — always 202: an email is sent if the address has an account. */
  @Public()
  @Post('auth/password/forgot')
  @HttpCode(202)
  async forgot(@Body() body: unknown) {
    const { email } = parse(z.object({ email: Email }), body);
    await this.auth.forgotPassword(email);
    return { status: 'sent_if_known' };
  }

  /** POST /v1/auth/password/reset — new password from the emailed link; every device is signed out. */
  @Public()
  @Post('auth/password/reset')
  @HttpCode(204)
  async reset(@Body() body: unknown) {
    const b = parse(z.object({ token: z.string().min(20).max(100), password: Password }), body);
    await this.auth.resetPassword(b.token, b.password).catch(authProblem);
  }

  /** POST /v1/auth/email/verify — the link in the confirmation email. */
  @Public()
  @Post('auth/email/verify')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown) {
    const { token } = parse(z.object({ token: z.string().min(20).max(100) }), body);
    await this.auth.verifyEmail(token).catch(authProblem);
  }

  /** GET /v1/auth/google — is Google sign-in switched on? */
  @Public()
  @Get('auth/google')
  googleStatus() {
    return { enabled: this.auth.google.enabled };
  }

  private redirectOk(uri: string): boolean {
    return uri === `${this.cfg.PUBLIC_WEB_URL}/auth/google/callback`;
  }

  /** POST /v1/auth/google/start — where to send the person; the caller keeps state, codeVerifier and nonce. */
  @Public()
  @Post('auth/google/start')
  @HttpCode(200)
  googleStart(@Body() body: unknown) {
    const { redirectUri } = parse(z.object({ redirectUri: z.string().url() }), body);
    if (!this.auth.google.enabled) authProblem(new AuthError('google_disabled', 'Google sign-in is not switched on yet'));
    if (!this.redirectOk(redirectUri)) throw badRequest('invalid_redirect', 'This return address is not allowed');
    return this.auth.google.start(redirectUri);
  }

  /** POST /v1/auth/google/finish — Google sent the person back with a code. */
  @Public()
  @Post('auth/google/finish')
  @HttpCode(200)
  async googleFinish(@Body() body: unknown, @Headers('user-agent') ua?: string, @Ip() ip?: string) {
    const b = parse(z.object({ code: z.string().min(1).max(2000), redirectUri: z.string().url(), codeVerifier: z.string().min(43).max(128), nonce: z.string().min(16).max(100), deviceToken: DeviceToken }), body);
    if (!this.redirectOk(b.redirectUri)) throw badRequest('invalid_redirect', 'This return address is not allowed');
    return this.auth.googleFinish(b.code, b.redirectUri, b.codeVerifier, b.nonce, ctxOf(ua, ip, b.deviceToken)).catch(authProblem);
  }

  /** POST /v1/auth/google/complete — a new person gives the details SAZO needs (surname, gender, date of birth). */
  @Public()
  @Post('auth/google/complete')
  @HttpCode(201)
  async googleComplete(@Body() body: unknown, @Headers('user-agent') ua?: string, @Ip() ip?: string) {
    const b = parse(PersonDetails.extend({ signupToken: z.string().min(20).max(4000) }), body);
    const { signupToken, ...details } = b;
    return this.auth.googleComplete(signupToken, details, ctxOf(ua, ip)).catch(authProblem);
  }

  /** POST /v1/auth/refresh — rotates the refresh token. */
  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown) {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(20) }), body);
    return this.auth.refresh(refreshToken).catch(authProblem);
  }

  /** POST /v1/auth/sign-out */
  @Post('auth/sign-out')
  @HttpCode(204)
  async signOut(@CurrentActor() actor: Actor) {
    await this.auth.signOut(actor.sessionId);
  }

  /** GET /v1/me — who is signed in; `needsDetails` lists details an older account must still give (D-101). */
  @Get('me')
  async me(@CurrentActor() actor: Actor) {
    const d = await this.auth.summary(actor.userId);
    return {
      id: actor.userId,
      displayName: actor.displayName,
      initials: d.initials,
      needsDetails: d.needsDetails,
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
