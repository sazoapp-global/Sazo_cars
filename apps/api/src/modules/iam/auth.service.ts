// Sign-in with a one-time SMS code, short-lived access tokens and rotating refresh tokens.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { NotificationsService } from '../notify/index.js';
import type { Actor } from './actor.js';
import { IamRepository } from './iam.repository.js';

/** Refreshes this close together count as one browser racing itself, not a stolen token. */
const REFRESH_GRACE_SECONDS = 10;

export class AuthError extends Error {
  constructor(readonly code: 'rate_limited' | 'invalid_code' | 'display_name_required' | 'invalid_token' | 'account_suspended' | 'refresh_in_progress' | 'phone_in_use' | 'same_phone', message: string) {
    super(message);
  }
}

export interface Tokens { accessToken: string; refreshToken: string; expiresIn: number }

const OTP_TTL_MINUTES = 10;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamRepository) private readonly repo: IamRepository,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {
    this.key = new TextEncoder().encode(cfg.JWT_SECRET);
  }

  private codeHmac(phone: string, code: string): string {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(`${phone}:${code}`).digest('hex');
  }

  /** Always behaves the same whether or not the number has an account (no account discovery). */
  async requestOtp(phone: string): Promise<void> {
    if ((await this.repo.recentOtpCount(phone, 60)) >= OTP_MAX_PER_HOUR) throw new AuthError('rate_limited', 'Too many codes requested; try again later');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.createOtp(phone, this.codeHmac(phone, code), OTP_TTL_MINUTES);
    await this.notify.sendSmsToPhone(phone, 'otp', { code }, 'otp');
  }

  /** Exchange a code for tokens. First sign-in creates the account (consumer role) and needs a display name. */
  async verifyOtp(phone: string, code: string, displayName?: string, userAgent?: string): Promise<Tokens & { created: boolean }> {
    const challenge = await this.repo.latestOpenOtp(phone);
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError('invalid_code', 'Code is wrong or expired');
    const a = Buffer.from(challenge.codeHmac, 'hex');
    const b = Buffer.from(this.codeHmac(phone, code), 'hex');
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      await this.repo.otpAttempt(challenge.id, false);
      throw new AuthError('invalid_code', 'Code is wrong or expired');
    }

    let user = await this.repo.userByPhone(phone);
    // The code is proven correct, so asking for a name leaks nothing; keep the code usable for the retry.
    if (!user && !displayName?.trim()) throw new AuthError('display_name_required', 'Tell us your name to create your account');
    await this.repo.otpAttempt(challenge.id, true);
    let created = false;
    if (!user) {
      if (!displayName?.trim()) throw new AuthError('display_name_required', 'Tell us your name to create your account');
      const id = await withTx(this.pool, async (tx) => {
        const uid = await this.repo.createUser(tx, displayName.trim(), phone);
        await this.repo.assignPlatformRole(tx, uid, 'consumer');
        return uid;
      });
      user = (await this.repo.userById(id))!;
      created = true;
    }
    if (user.status !== 'active') throw new AuthError('account_suspended', 'This account is not active');
    return { ...(await this.issueTokens(user.id, userAgent)), created };
  }

  // ---------- changing the phone number (the code goes to the NEW number, proving the person has it)

  async requestPhoneChange(userId: string, newPhone: string): Promise<void> {
    const user = await this.repo.userById(userId);
    if (user?.phone === newPhone) throw new AuthError('same_phone', 'That is already your number');
    if ((await this.repo.recentOtpCount(newPhone, 60)) >= OTP_MAX_PER_HOUR) throw new AuthError('rate_limited', 'Too many codes requested; try again later');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.createOtp(newPhone, this.codeHmac(newPhone, code), OTP_TTL_MINUTES, 'change_phone', userId);
    await this.notify.sendSmsToPhone(newPhone, 'phone_change_code', { code }, 'otp', userId);
  }

  /** Move the account to the new number. Other devices are signed out; the old number gets a warning text. */
  async confirmPhoneChange(userId: string, sessionId: string, newPhone: string, code: string): Promise<void> {
    const challenge = await this.repo.latestOpenOtp(newPhone, 'change_phone', userId);
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError('invalid_code', 'Code is wrong or expired');
    const a = Buffer.from(challenge.codeHmac, 'hex');
    const b = Buffer.from(this.codeHmac(newPhone, code), 'hex');
    if (!(a.length === b.length && timingSafeEqual(a, b))) {
      await this.repo.otpAttempt(challenge.id, false);
      throw new AuthError('invalid_code', 'Code is wrong or expired');
    }
    await this.repo.otpAttempt(challenge.id, true);
    const old = (await this.repo.userById(userId))?.phone;
    if (!(await this.repo.setPhone(userId, newPhone))) throw new AuthError('phone_in_use', 'Another SAZO account uses that number');
    await this.repo.revokeAllSessions(userId, 'phone_changed', sessionId);
    if (old) await this.notify.sendSmsToPhone(old, 'phone_changed', {}, 'account', userId).catch(() => false);
  }

  async issueTokens(userId: string, userAgent?: string): Promise<Tokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const sessionId = await this.repo.createSession(userId, sha256(refreshToken), this.cfg.REFRESH_TOKEN_TTL_DAYS, userAgent);
    return { accessToken: await this.sign(userId, sessionId), refreshToken, expiresIn: this.cfg.ACCESS_TOKEN_TTL_SECONDS };
  }

  /** Rotate the refresh token. Presenting an already-rotated token revokes the session (stolen-token defence). */
  async refresh(refreshToken: string): Promise<Tokens> {
    const hash = sha256(refreshToken);
    const s = await this.repo.sessionByRefresh(hash);
    if (!s) {
      const reused = await this.repo.sessionByPreviousRefresh(hash);
      // The same browser sending two requests at once (e.g. a page and a prefetch) is not theft:
      // within a few seconds of a rotation, answer "already refreshed" and keep the session.
      if (reused && reused.secondsSinceRotation < REFRESH_GRACE_SECONDS) throw new AuthError('refresh_in_progress', 'Already refreshed; use the newest token');
      if (reused) await this.repo.revokeSession(reused.id, 'refresh_token_reuse');
      throw new AuthError('invalid_token', 'Sign in again');
    }
    if (s.revoked || s.expired) throw new AuthError('invalid_token', 'Sign in again');
    const next = randomBytes(32).toString('base64url');
    if (!(await this.repo.rotateSession(s.id, hash, sha256(next)))) throw new AuthError('refresh_in_progress', 'Already refreshed; use the newest token');
    return { accessToken: await this.sign(s.userId, s.id), refreshToken: next, expiresIn: this.cfg.ACCESS_TOKEN_TTL_SECONDS };
  }

  async signOut(sessionId: string): Promise<void> {
    await this.repo.revokeSession(sessionId, 'signed_out');
  }

  private sign(userId: string, sessionId: string): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('sazo')
      .setAudience('sazo-api')
      .setIssuedAt()
      .setExpirationTime(`${this.cfg.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** Verify an access token and load the actor fresh from the database (role/org changes apply at once). */
  async actorFromToken(token: string): Promise<Actor> {
    let sub: string;
    let sid: string;
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: 'sazo', audience: 'sazo-api', algorithms: ['HS256'] });
      sub = String(payload.sub);
      sid = String(payload.sid);
    } catch {
      throw new AuthError('invalid_token', 'Sign in again');
    }
    const [user, active] = await Promise.all([this.repo.userById(sub), this.repo.sessionActive(sid, sub)]);
    if (!user || !active) throw new AuthError('invalid_token', 'Sign in again');
    if (user.status !== 'active') throw new AuthError('account_suspended', 'This account is not active');
    const [platform, memberships] = await Promise.all([this.repo.platformRolesAndPermissions(sub), this.repo.memberships(sub)]);
    return {
      userId: sub,
      sessionId: sid,
      displayName: user.displayName,
      platformRoles: platform.roles,
      permissions: new Set(platform.permissions),
      memberships,
    };
  }
}
