// Accounts and log-in (D-100 – D-105): create an account first (email + password, phone + code, or Google),
// then log in with any method the person has set up. Short-lived access tokens, rotating refresh tokens,
// every attempt recorded, lock-outs, and a second step on new devices for everyone (D-145).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MINIMUM_AGE, ageOn, passwordProblems, personDisplayName, personInitials, type PersonDetails } from '@sazo/contracts';
import { jwtVerify, SignJWT } from 'jose';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { PII_KEYRING, type Keyring } from '../../platform/keyring.js';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import { NotificationsService } from '../notify/index.js';
import type { Actor } from './actor.js';
import { GoogleSignIn, type GoogleProfile } from './google.js';
import { IamRepository, type SecondStepChannel, type UserRow } from './iam.repository.js';
import { burnPasswordTime, hashPassword, verifyPassword } from './passwords.js';
import { matchTotp, newBackupCode, newTotpSecret, normaliseBackupCode, otpauthUrl } from './totp.js';

/** Refreshes this close together count as one browser racing itself, not a stolen token. */
const REFRESH_GRACE_SECONDS = 10;

export class AuthError extends Error {
  constructor(
    readonly code: 'rate_limited' | 'invalid_code' | 'signup_details_required' | 'invalid_token' | 'account_suspended' | 'refresh_in_progress'
      | 'phone_in_use' | 'same_phone' | 'no_account' | 'account_exists' | 'invalid_credentials' | 'account_locked' | 'weak_password'
      | 'email_in_use' | 'invalid_link' | 'too_young' | 'google_disabled' | 'google_failed' | 'wrong_password' | 'details_locked'
      | 'session_idle' | 'phone_required',
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

export interface Tokens { accessToken: string; refreshToken: string; expiresIn: number }
/** Where the request came from: recorded with every log-in attempt. `deviceToken` = this device passed the second step before. */
export interface LoginContext { userAgent?: string; ip?: string | null; deviceToken?: string }
/**
 * `second_step`: on a new device (D-145). `add_phone`: the account has no phone yet and must add one before going in.
 * `setup_authenticator`: SAZO staff set up an authenticator app before going in. Backup codes are shown once.
 */
export type LoginResult =
  | ({ status: 'signed_in'; created: boolean; deviceToken?: string; backupCodes?: string[] } & Tokens)
  | { status: 'second_step'; challengeId: string; channel: SecondStepChannel; sentTo?: string }
  | { status: 'add_phone'; setupToken: string }
  | { status: 'setup_authenticator'; setupToken: string };
type FirstFactor = 'password' | 'phone_code' | 'google';
export type GoogleResult = LoginResult | { status: 'needs_details'; signupToken: string; suggested: { firstName: string | null; surname: string | null; email: string | null } };

const OTP_TTL_MINUTES = 10;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
/** Lock-out after this many wrong passwords in LOCK_MINUTES (D-105): fewer for sensitive roles. */
const LOCK_AFTER = { normal: 10, sensitive: 5 };
const LOCK_MINUTES = 15;
const SECOND_STEP_TTL_MINUTES = 10;
const TRUSTED_DEVICE_DAYS = 90;
const VERIFY_LINK_MINUTES = 24 * 60;
const RESET_LINK_MINUTES = 60;
/** Roles whose accounts can change car history or SAZO itself: stricter passwords and a second step (D-105). */
const SENSITIVE_PLATFORM_ROLES = new Set(['sazo_reviewer', 'sazo_admin', 'super_admin', 'partner_operator']);
/** SAZO's own staff: an authenticator app instead of SMS for their second step (D-145). */
const STAFF_ROLES = new Set(['sazo_reviewer', 'sazo_admin', 'super_admin']);
const BACKUP_CODES = 10;
const mask = (phone: string) => `${phone.slice(0, 4)} ••• ••${phone.slice(-3)}`;
const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a: string, b: string, c: string) => `${a}${'•'.repeat(Math.min(b.length, 6))}${c}`);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  private readonly key: Uint8Array;
  private readonly log = new Logger('Auth');
  readonly google: GoogleSignIn;

  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(IamRepository) private readonly repo: IamRepository,
    @Inject(NotificationsService) private readonly notify: NotificationsService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(PII_KEYRING) private readonly keyring: Keyring,
  ) {
    this.key = new TextEncoder().encode(cfg.JWT_SECRET);
    this.google = new GoogleSignIn(cfg);
  }

  private identifierHash(kind: 'email' | 'phone', value: string): Buffer {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(`${kind}:${value.toLowerCase()}`).digest();
  }

  private codeHmac(phone: string, code: string): string {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(`${phone}:${code}`).digest('hex');
  }

  /**
   * Send a code. `login` refuses numbers with no account and `signup` refuses numbers that already have one
   * (telling people this is agreed, D-100) — so no SMS is paid for that can't be used.
   */
  async requestOtp(phone: string, intent: 'login' | 'signup' = 'login'): Promise<void> {
    const user = await this.repo.userByPhone(phone);
    if (intent === 'login' && (!user || user.status === 'deleted')) throw new AuthError('no_account', 'No SAZO account uses this number. Create one');
    if (intent === 'signup' && user) throw new AuthError('account_exists', 'This number already has a SAZO account. Log in instead');
    if ((await this.repo.recentOtpCount(phone, 60)) >= OTP_MAX_PER_HOUR) throw new AuthError('rate_limited', 'Too many codes requested; try again later');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.createOtp(phone, this.codeHmac(phone, code), OTP_TTL_MINUTES);
    await this.notify.sendSmsToPhone(phone, 'otp', { code }, 'otp');
  }

  /**
   * Check a phone code. An existing account logs in; a new number needs the sign-up details (an account is
   * only ever created on purpose, with name, gender and an 18+ date of birth).
   */
  async verifyOtp(phone: string, code: string, signup: PersonDetails | undefined, ctx: LoginContext = {}): Promise<LoginResult> {
    const challenge = await this.repo.latestOpenOtp(phone);
    const idHash = this.identifierHash('phone', phone);
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await this.repo.recordLoginAttempt({ userId: null, identifierHash: idHash, method: 'phone_code', success: false, failureReason: 'no_open_code', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('invalid_code', 'Code is wrong or expired');
    }
    const a = Buffer.from(challenge.codeHmac, 'hex');
    const b = Buffer.from(this.codeHmac(phone, code), 'hex');
    const existing = await this.repo.userByPhone(phone);
    if (!(a.length === b.length && timingSafeEqual(a, b))) {
      await this.repo.otpAttempt(challenge.id, false);
      await this.repo.recordLoginAttempt({ userId: existing?.id ?? null, identifierHash: idHash, method: 'phone_code', success: false, failureReason: 'wrong_code', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('invalid_code', 'Code is wrong or expired');
    }
    // The code is proven correct, so asking for the details leaks nothing; keep the code usable for the retry.
    if (!existing && !signup) throw new AuthError('signup_details_required', 'No account uses this number yet. Fill in your details to create one');
    await this.repo.otpAttempt(challenge.id, true);
    if (existing) return this.completeLogin(existing, 'phone_code', idHash, ctx, false);
    const id = await this.createAccount(signup!, { phone });
    if (!id) throw new AuthError('account_exists', 'This number already has a SAZO account. Log in instead');
    return this.completeLogin((await this.repo.userById(id))!, 'phone_code', idHash, ctx, true);
  }

  // ---------- accounts

  private dobOk(dob: string): void {
    if (ageOn(dob) < MINIMUM_AGE) throw new AuthError('too_young', `You must be ${MINIMUM_AGE} or older to use SAZO`);
  }

  /** Create the account with its details. Undefined if the phone or email is already used. */
  private async createAccount(d: PersonDetails, via: { phone?: string; email?: string; emailVerified?: boolean; password?: string; google?: GoogleProfile }): Promise<string | undefined> {
    this.dobOk(d.dateOfBirth);
    const hash = via.password ? await hashPassword(via.password) : undefined;
    return withTx(this.pool, async (tx) => {
      const id = await this.repo.createAccount(tx, {
        surname: d.surname, firstName: d.firstName, middleName: d.middleName ?? null, displayName: personDisplayName(d), gender: d.gender,
        dobCiphertext: this.keyring.encrypt(d.dateOfBirth), dobKeyVersion: this.keyring.current,
        phone: via.phone ?? null, email: via.email ?? null, emailVerified: via.emailVerified,
      });
      if (!id) return undefined;
      await this.repo.assignPlatformRole(tx, id, 'consumer');
      if (hash) await this.repo.setPassword(tx, id, hash, via.password!.length >= 12);
      if (via.google) await this.repo.linkGoogle(tx, id, via.google.subject, via.google.email);
      await this.repo.audit(tx, { actorUserId: id, action: 'account.created', targetType: 'user', targetId: id,
        details: { method: via.google ? 'google' : via.password ? 'email_password' : 'phone_code' } });
      return id;
    });
  }

  /** Sign up with email and password: logged in at once; a link confirms the email (needed for password reset). */
  async signupWithEmail(d: PersonDetails, email: string, password: string, ctx: LoginContext = {}): Promise<LoginResult> {
    const problems = passwordProblems(password, { sensitive: false, email, names: [d.surname, d.firstName] });
    if (problems.length) throw new AuthError('weak_password', problems[0]!, problems);
    if (await this.repo.userByEmail(email)) throw new AuthError('account_exists', 'This email already has a SAZO account. Log in instead');
    const id = await this.createAccount(d, { email, password });
    if (!id) throw new AuthError('account_exists', 'This email already has a SAZO account. Log in instead');
    await this.sendVerifyLink(id, email, personDisplayName(d));
    return this.completeLogin((await this.repo.userById(id))!, 'password', this.identifierHash('email', email), ctx, true);
  }

  async passwordLogin(email: string, password: string, ctx: LoginContext = {}): Promise<LoginResult> {
    const idHash = this.identifierHash('email', email);
    const user = await this.repo.userByEmail(email);
    if (!user) {
      await burnPasswordTime(password);
      await this.repo.recordLoginAttempt({ userId: null, identifierHash: idHash, method: 'password', success: false, failureReason: 'no_account', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('no_account', 'No SAZO account uses this email. Create one');
    }
    const sensitive = await this.isSensitive(user.id);
    if ((await this.repo.recentFailures(user.id, LOCK_MINUTES)) >= LOCK_AFTER[sensitive ? 'sensitive' : 'normal']) {
      await this.repo.recordLoginAttempt({ userId: user.id, identifierHash: idHash, method: 'password', success: false, failureReason: 'locked', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('account_locked', `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes, or reset your password.`);
    }
    const stored = await this.repo.password(user.id);
    const ok = stored ? await verifyPassword(password, stored.hash) : (await burnPasswordTime(password), false);
    if (!ok) {
      await this.repo.recordLoginAttempt({ userId: user.id, identifierHash: idHash, method: 'password', success: false, failureReason: stored ? 'wrong_password' : 'no_password', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('invalid_credentials', stored ? 'Wrong email or password' : 'This account has no password yet. Log in with your phone code or Google, then set one in Settings');
    }
    return this.completeLogin(user, 'password', idHash, ctx, false);
  }

  /**
   * After the first factor: refuse inactive accounts, then a second step on a new device for everyone (D-145),
   * then anything the account must do before going in (add a phone; staff set up an authenticator app).
   */
  private async completeLogin(user: UserRow, method: FirstFactor, idHash: Buffer, ctx: LoginContext, created: boolean): Promise<LoginResult> {
    if (user.status !== 'active') {
      await this.repo.recordLoginAttempt({ userId: user.id, identifierHash: idHash, method, success: false, failureReason: 'not_active', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('account_suspended', 'This account is not active');
    }
    const trusted = !!ctx.deviceToken && (await this.repo.isTrustedDevice(user.id, sha256(ctx.deviceToken)));
    if (!created && !trusted) {
      const second = await this.startSecondStep(user, method);
      if (second) return second;
    }
    return this.finishLogin(user.id, { method, created, trust: false }, ctx, idHash);
  }

  /**
   * Both factors are done. Still to do before going in, never at sign-up itself: add and confirm a phone when the
   * account has none, then (SAZO staff) set up an authenticator app. Otherwise the tokens.
   */
  private async finishLogin(userId: string, f: { method: FirstFactor | 'second_step'; created: boolean; trust: boolean }, ctx: LoginContext, idHash: Buffer | null): Promise<LoginResult> {
    const user = (await this.repo.userById(userId))!;
    if (!f.created) {
      if (!user.phone) return { status: 'add_phone', setupToken: await this.setupToken(user.id, f.trust) };
      if (await this.needsAuthenticator(user.id)) return { status: 'setup_authenticator', setupToken: await this.setupToken(user.id, f.trust) };
    }
    await this.repo.recordLoginAttempt({ userId: user.id, identifierHash: idHash, method: f.method, success: true, ip: ctx.ip, userAgent: ctx.userAgent });
    let deviceToken: string | undefined;
    if (f.trust) {
      deviceToken = randomBytes(32).toString('base64url');
      await this.repo.trustDevice(user.id, sha256(deviceToken), ctx.userAgent, TRUSTED_DEVICE_DAYS);
    }
    return { status: 'signed_in', created: f.created, ...(deviceToken ? { deviceToken } : {}), ...(await this.issueTokens(user.id, ctx.userAgent)) };
  }

  /** Managers, dealer staff, partner data entry and SAZO staff (D-105): stricter passwords and lock-outs. */
  async isSensitive(userId: string): Promise<boolean> {
    const [platform, memberships] = await Promise.all([this.repo.platformRolesAndPermissions(userId), this.repo.memberships(userId)]);
    return platform.roles.some((r) => SENSITIVE_PLATFORM_ROLES.has(r))
      || memberships.some((m) => m.status === 'active' && (m.role === 'org_manager' || m.role === 'partner_operator' || m.organisationType === 'dealer'));
  }

  /** SAZO staff must use an authenticator app, not SMS (D-145). */
  async isStaff(userId: string): Promise<boolean> {
    return (await this.repo.platformRolesAndPermissions(userId)).roles.some((r) => STAFF_ROLES.has(r));
  }

  private async needsAuthenticator(userId: string): Promise<boolean> {
    return (await this.isStaff(userId)) && !(await this.repo.authenticator(userId))?.confirmed;
  }

  /**
   * Which second step: the authenticator app when set up; otherwise a code to the other contact. A phone code
   * already proves the SIM, so it is followed by an email code, or the password when the email isn't confirmed.
   * Undefined = nothing else to ask (a phone-only account: the phone code is the whole log-in).
   */
  private async secondChannel(user: UserRow, method: FirstFactor): Promise<SecondStepChannel | undefined> {
    if ((await this.repo.authenticator(user.id))?.confirmed) return 'authenticator';
    if (method === 'phone_code') {
      if (user.email && user.emailVerified) return 'email';
      return (await this.repo.password(user.id)) ? 'password' : undefined;
    }
    return user.phone ? 'sms' : user.email ? 'email' : undefined;
  }

  private async startSecondStep(user: UserRow, method: FirstFactor): Promise<LoginResult | undefined> {
    const channel = await this.secondChannel(user, method);
    if (!channel) return undefined;
    // Nothing is sent for the app or the password; wrong answers count towards the lock-out instead.
    if (channel === 'authenticator' || channel === 'password') {
      const challengeId = await this.repo.createSecondStep(user.id, channel, method, null, SECOND_STEP_TTL_MINUTES);
      return { status: 'second_step', challengeId, channel };
    }
    if ((await this.repo.recentSecondSteps(user.id, 60)) >= OTP_MAX_PER_HOUR) throw new AuthError('rate_limited', 'Too many codes requested; try again later');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challengeId = await this.repo.createSecondStep(user.id, channel, method, this.secondStepHmac(user.id, code), SECOND_STEP_TTL_MINUTES);
    if (channel === 'sms') await this.notify.sendSmsToPhone(user.phone!, 'second_step', { code }, 'otp', user.id);
    else await this.notify.sendEmail(user.email!, 'second_step', { code, name: user.firstName ?? user.displayName }, 'otp', user.id);
    return { status: 'second_step', challengeId, channel, sentTo: channel === 'sms' ? mask(user.phone!) : maskEmail(user.email!) };
  }

  private secondStepHmac(userId: string, code: string): string {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(`2fa:${userId}:${code}`).digest('hex');
  }

  private backupHmac(userId: string, code: string): string {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(`backup:${userId}:${normaliseBackupCode(code)}`).digest('hex');
  }

  private async checkSecondStep(c: { userId: string; channel: SecondStepChannel; codeHmac: string | null }, code: string): Promise<boolean> {
    if (c.channel === 'password') {
      const stored = await this.repo.password(c.userId);
      return !!stored && (await verifyPassword(code, stored.hash));
    }
    if (c.channel === 'authenticator') {
      if (/^\d{6}$/.test(code)) {
        const a = await this.repo.authenticator(c.userId);
        const step = a?.confirmed ? matchTotp(this.keyring.decrypt(a.secretCiphertext, a.keyVersion), code) : undefined;
        return step !== undefined && (await this.repo.useTotpStep(c.userId, step));
      }
      return this.repo.useBackupCode(c.userId, this.backupHmac(c.userId, code));
    }
    if (!c.codeHmac || !/^\d{6}$/.test(code)) return false;
    const a = Buffer.from(c.codeHmac, 'hex');
    const b = Buffer.from(this.secondStepHmac(c.userId, code), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Finish a log-in with the second step: the texted or emailed code, the authenticator app's code (or a backup
   * code), or the password. Optionally remember this device (no second step here for 90 days).
   */
  async completeSecondStep(challengeId: string, code: string, rememberDevice: boolean, ctx: LoginContext = {}): Promise<LoginResult> {
    const c = await this.repo.secondStep(challengeId);
    if (!c || c.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError('invalid_code', 'Code is wrong or expired. Log in again');
    const user = await this.repo.userById(c.userId);
    if (!user || !(await this.checkSecondStep(c, code))) {
      await this.repo.secondStepAttempt(c.id, false);
      await this.repo.recordLoginAttempt({ userId: c.userId, identifierHash: null, method: 'second_step', success: false, failureReason: c.channel === 'password' ? 'wrong_password' : 'wrong_code', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('invalid_code', c.channel === 'password' ? 'Wrong password' : 'Code is wrong or expired');
    }
    await this.repo.secondStepAttempt(c.id, true);
    if (user.status !== 'active') throw new AuthError('account_suspended', 'This account is not active');
    if (c.channel === 'authenticator' && !/^\d{6}$/.test(code)) {
      await this.repo.audit(this.pool, { actorUserId: user.id, action: 'account.backup_code_used', targetType: 'user', targetId: user.id, details: { left: await this.repo.backupCodesLeft(user.id) } });
    }
    return this.finishLogin(user.id, { method: 'second_step', created: false, trust: rememberDevice }, ctx, null);
  }

  // ---------- before going in: add a phone, set up the authenticator app (D-145)

  private setupKey(): Uint8Array {
    return new TextEncoder().encode(`${this.cfg.JWT_SECRET}:login-setup`);
  }

  /** Proof that both factors passed, good for 15 minutes, to finish the steps before going in. */
  private setupToken(userId: string, trust: boolean): Promise<string> {
    return new SignJWT({ t: trust }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setAudience('sazo-login-setup')
      .setIssuedAt().setExpirationTime('15m').sign(this.setupKey());
  }

  private async readSetupToken(token: string): Promise<{ user: UserRow; trust: boolean }> {
    try {
      const { payload } = await jwtVerify(token, this.setupKey(), { audience: 'sazo-login-setup', algorithms: ['HS256'] });
      const user = await this.repo.userById(String(payload.sub));
      if (!user) throw new Error('gone');
      if (user.status !== 'active') throw new AuthError('account_suspended', 'This account is not active');
      return { user, trust: payload.t === true };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError('invalid_link', 'This took too long. Log in again');
    }
  }

  /** Text a code to the phone being added. */
  async addPhoneStart(setupToken: string, phone: string): Promise<{ sentTo: string }> {
    const { user } = await this.readSetupToken(setupToken);
    if (user.phone) throw new AuthError('invalid_link', 'Your account already has a phone. Log in again');
    const other = await this.repo.userByPhone(phone);
    if (other && other.id !== user.id) throw new AuthError('phone_in_use', 'Another SAZO account uses that number');
    if ((await this.repo.recentOtpCount(phone, 60)) >= OTP_MAX_PER_HOUR) throw new AuthError('rate_limited', 'Too many codes requested; try again later');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.createOtp(phone, this.codeHmac(phone, code), OTP_TTL_MINUTES, 'add_phone', user.id);
    await this.notify.sendSmsToPhone(phone, 'phone_add_code', { code }, 'otp', user.id);
    return { sentTo: mask(phone) };
  }

  /** The code was right: the phone is saved, and the log-in carries on. */
  async addPhoneFinish(setupToken: string, phone: string, code: string, ctx: LoginContext = {}): Promise<LoginResult> {
    const { user, trust } = await this.readSetupToken(setupToken);
    if (user.phone) throw new AuthError('invalid_link', 'Your account already has a phone. Log in again');
    const challenge = await this.repo.latestOpenOtp(phone, 'add_phone', user.id);
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError('invalid_code', 'Code is wrong or expired. Send a new code');
    const a = Buffer.from(challenge.codeHmac, 'hex');
    const b = Buffer.from(this.codeHmac(phone, code), 'hex');
    if (!(a.length === b.length && timingSafeEqual(a, b))) {
      await this.repo.otpAttempt(challenge.id, false);
      throw new AuthError('invalid_code', 'Code is wrong or expired');
    }
    await this.repo.otpAttempt(challenge.id, true);
    if (!(await this.repo.setPhone(user.id, phone))) throw new AuthError('phone_in_use', 'Another SAZO account uses that number');
    await this.repo.audit(this.pool, { actorUserId: user.id, action: 'account.phone_added', targetType: 'user', targetId: user.id });
    return this.finishLogin(user.id, { method: 'second_step', created: false, trust }, ctx, null);
  }

  /** A new key for the app, as text and as the link the QR code holds. Asking again gives a fresh key. */
  async authenticatorStart(setupToken: string): Promise<{ secret: string; otpauthUrl: string }> {
    const { user } = await this.readSetupToken(setupToken);
    if (!(await this.needsAuthenticator(user.id))) throw new AuthError('invalid_link', 'Your authenticator app is already set up. Log in again');
    const secret = newTotpSecret();
    if (!(await this.repo.pendingAuthenticator(user.id, this.keyring.encrypt(secret), this.keyring.current))) {
      throw new AuthError('invalid_link', 'Your authenticator app is already set up. Log in again');
    }
    return { secret, otpauthUrl: otpauthUrl(secret, user.email ?? user.phone ?? user.displayName) };
  }

  /** The first code from the app confirms it. Ten backup codes are made and shown this once. */
  async authenticatorFinish(setupToken: string, code: string, ctx: LoginContext = {}): Promise<LoginResult> {
    const { user, trust } = await this.readSetupToken(setupToken);
    if ((await this.repo.recentFailures(user.id, LOCK_MINUTES)) >= LOCK_AFTER.sensitive) {
      throw new AuthError('account_locked', `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.`);
    }
    const a = await this.repo.authenticator(user.id);
    if (!a || a.confirmed) throw new AuthError('invalid_link', 'Start the set-up again');
    const step = /^\d{6}$/.test(code) ? matchTotp(this.keyring.decrypt(a.secretCiphertext, a.keyVersion), code) : undefined;
    if (step === undefined) {
      await this.repo.recordLoginAttempt({ userId: user.id, identifierHash: null, method: 'second_step', success: false, failureReason: 'wrong_setup_code', ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError('invalid_code', 'That code is wrong. Check the time on your phone is right, then type the newest code');
    }
    const codes = Array.from({ length: BACKUP_CODES }, newBackupCode);
    if (!(await this.repo.confirmAuthenticator(user.id, step, codes.map((c) => this.backupHmac(user.id, c))))) {
      throw new AuthError('invalid_link', 'Your authenticator app is already set up. Log in again');
    }
    await this.repo.audit(this.pool, { actorUserId: user.id, action: 'account.authenticator_set', targetType: 'user', targetId: user.id });
    const r = await this.finishLogin(user.id, { method: 'second_step', created: false, trust }, ctx, null);
    return r.status === 'signed_in' ? { ...r, backupCodes: codes } : r;
  }

  /** For Settings: is the app set up, and how many backup codes are left. */
  async authenticatorStatus(userId: string): Promise<{ required: boolean; setUp: boolean; backupCodesLeft: number }> {
    const [staff, a] = await Promise.all([this.isStaff(userId), this.repo.authenticator(userId)]);
    return { required: staff, setUp: !!a?.confirmed, backupCodesLeft: a?.confirmed ? await this.repo.backupCodesLeft(userId) : 0 };
  }

  /**
   * A SAZO administrator clears someone's app (lost phone, no backup codes left). They are signed out everywhere
   * and set up a new app at their next log-in, after the code to their phone or email.
   */
  async resetAuthenticator(actorUserId: string, userId: string): Promise<boolean> {
    if (actorUserId === userId) throw new AuthError('details_locked', 'Another administrator must clear your own app');
    const removed = await this.repo.removeAuthenticator(userId);
    if (!removed) return false;
    await this.repo.revokeAllSessions(userId, 'authenticator_reset');
    await this.repo.forgetDevices(userId);
    await this.repo.audit(this.pool, { actorUserId, action: 'account.authenticator_reset', targetType: 'user', targetId: userId });
    return true;
  }

  // ---------- email links

  private async sendVerifyLink(userId: string, email: string, name: string): Promise<void> {
    if ((await this.repo.recentEmailTokens(email, 'verify_email', 60)) >= 3) throw new AuthError('rate_limited', 'Too many emails sent; try again in an hour');
    const token = randomBytes(32).toString('base64url');
    await this.repo.createEmailToken(userId, 'verify_email', email, sha256(token), VERIFY_LINK_MINUTES);
    const sent = await this.notify.sendEmail(email, 'verify_email', { name, link: `${this.cfg.PUBLIC_WEB_URL}/verify-email?token=${token}` }, 'account', userId);
    if (!sent) this.log.warn('verification email was not sent');
  }

  /** Add or change the email: it is saved once confirmed by the link. */
  async requestEmail(userId: string, email: string): Promise<void> {
    const user = await this.repo.userById(userId);
    const other = await this.repo.userByEmail(email);
    if (other && other.id !== userId) throw new AuthError('email_in_use', 'Another SAZO account uses that email');
    if (user?.email?.toLowerCase() === email && user.emailVerified) return;
    if (!user?.email || !user.emailVerified) {
      if (!(await this.repo.setEmail(userId, email, false))) throw new AuthError('email_in_use', 'Another SAZO account uses that email');
    }
    await this.sendVerifyLink(userId, email, user?.firstName ?? user?.displayName ?? '');
  }

  async verifyEmail(token: string): Promise<void> {
    const t = await this.repo.useEmailToken(sha256(token), 'verify_email');
    if (!t) throw new AuthError('invalid_link', 'This link has expired or was already used. Ask for a new one');
    if (!(await this.repo.markEmailVerified(t.userId, t.email))) {
      // A change of email: the new address becomes the account's email now that it is confirmed.
      if (!(await this.repo.setEmail(t.userId, t.email, true))) throw new AuthError('email_in_use', 'Another SAZO account uses that email');
    }
    await this.repo.audit(this.pool, { actorUserId: t.userId, action: 'account.email_verified', targetType: 'user', targetId: t.userId });
  }

  /** Always succeeds quietly (no hint whether the email has an account); at most 3 emails an hour per address. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.repo.userByEmail(email);
    if (!user || user.status !== 'active') return;
    if ((await this.repo.recentEmailTokens(email, 'reset_password', 60)) >= 3) return;
    const token = randomBytes(32).toString('base64url');
    await this.repo.createEmailToken(user.id, 'reset_password', email, sha256(token), RESET_LINK_MINUTES);
    await this.notify.sendEmail(email, 'reset_password', { name: user.firstName ?? user.displayName, link: `${this.cfg.PUBLIC_WEB_URL}/reset-password?token=${token}` }, 'account', user.id);
  }

  /**
   * Step two of a reset (D-145): the emailed link is good, so text a code to the account's phone. An account with
   * no phone can't reset this way: the person logs in another way and adds one, or contacts SAZO support.
   */
  async resetStart(token: string): Promise<{ sentTo: string }> {
    const peek = await this.repo.peekEmailToken(sha256(token), 'reset_password');
    if (!peek) throw new AuthError('invalid_link', 'This link has expired or was already used. Ask for a new one');
    const user = (await this.repo.userById(peek.userId))!;
    if (!user.phone) throw new AuthError('phone_required', 'Your account has no phone number, and a reset needs a code texted to your phone. Log in another way and add a phone in Settings, or contact SAZO support');
    if ((await this.repo.recentOtpCount(user.phone, 60)) >= OTP_MAX_PER_HOUR) throw new AuthError('rate_limited', 'Too many codes requested; try again later');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.repo.createOtp(user.phone, this.codeHmac(user.phone, code), OTP_TTL_MINUTES, 'reset_password', user.id);
    await this.notify.sendSmsToPhone(user.phone, 'reset_code', { code }, 'otp', user.id);
    return { sentTo: mask(user.phone) };
  }

  /**
   * A new password from the emailed link and the texted code: confirms the email, signs out every device and
   * forgets remembered devices. A wrong code or a refused password doesn't use up the link.
   */
  async resetPassword(token: string, code: string, password: string): Promise<void> {
    const peek = await this.repo.peekEmailToken(sha256(token), 'reset_password');
    if (!peek) throw new AuthError('invalid_link', 'This link has expired or was already used. Ask for a new one');
    const user = (await this.repo.userById(peek.userId))!;
    if (!user.phone) throw new AuthError('phone_required', 'Your account has no phone number. Contact SAZO support');
    const challenge = await this.repo.latestOpenOtp(user.phone, 'reset_password', user.id);
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError('invalid_code', 'Code is wrong or expired. Send a new code');
    const a = Buffer.from(challenge.codeHmac, 'hex');
    const b = Buffer.from(this.codeHmac(user.phone, code), 'hex');
    if (!(a.length === b.length && timingSafeEqual(a, b))) {
      await this.repo.otpAttempt(challenge.id, false);
      throw new AuthError('invalid_code', 'Code is wrong or expired');
    }
    await this.checkPassword(user, password);
    const t = await this.repo.useEmailToken(sha256(token), 'reset_password');
    if (!t) throw new AuthError('invalid_link', 'This link has expired or was already used. Ask for a new one');
    await this.repo.otpAttempt(challenge.id, true);
    await this.savePassword(user, password);
    await this.repo.markEmailVerified(user.id, t.email);
    await this.repo.revokeAllSessions(user.id, 'password_reset');
    await this.repo.forgetDevices(user.id);
    await this.repo.audit(this.pool, { actorUserId: user.id, action: 'account.password_reset', targetType: 'user', targetId: user.id });
  }

  /** Set or change the password from Settings. Changing needs the current one. */
  async changePassword(userId: string, current: string | undefined, next: string): Promise<void> {
    const user = (await this.repo.userById(userId))!;
    const stored = await this.repo.password(userId);
    if (stored && !(current && (await verifyPassword(current, stored.hash)))) throw new AuthError('wrong_password', 'Your current password is wrong');
    await this.savePassword(user, next);
    await this.repo.audit(this.pool, { actorUserId: userId, action: stored ? 'account.password_changed' : 'account.password_set', targetType: 'user', targetId: userId });
  }

  private async checkPassword(user: UserRow, password: string): Promise<void> {
    const sensitive = await this.isSensitive(user.id);
    const problems = passwordProblems(password, { sensitive, email: user.email, names: [user.surname ?? '', user.firstName ?? ''] });
    if (problems.length) throw new AuthError('weak_password', problems[0]!, problems);
  }

  private async savePassword(user: UserRow, password: string): Promise<void> {
    await this.checkPassword(user, password);
    await this.repo.setPassword(this.pool, user.id, await hashPassword(password), password.length >= 12);
    if (user.email && user.emailVerified) await this.notify.sendEmail(user.email, 'password_changed', { name: user.firstName ?? user.displayName }, 'account', user.id).catch(() => false);
  }

  // ---------- Google

  private signupKey(): Uint8Array {
    return new TextEncoder().encode(`${this.cfg.JWT_SECRET}:google-signup`);
  }

  async googleFinish(code: string, redirectUri: string, codeVerifier: string, nonce: string, ctx: LoginContext = {}): Promise<GoogleResult> {
    if (!this.google.enabled) throw new AuthError('google_disabled', 'Google sign-in is not switched on yet');
    let g: GoogleProfile;
    try {
      g = await this.google.finish(code, redirectUri, codeVerifier, nonce);
    } catch (err) {
      this.log.warn(`Google sign-in failed: ${(err as Error).message}`);
      throw new AuthError('google_failed', 'Google sign-in did not work. Try again');
    }
    const idHash = this.identifierHash('email', g.email ?? `google:${g.subject}`);
    const linked = await this.repo.userByGoogle(g.subject);
    if (linked) return this.completeLogin((await this.repo.userById(linked))!, 'google', idHash, ctx, false);
    // Same verified email as an existing account: link Google to it (Google has proven the email).
    const byEmail = g.email && g.emailVerified ? await this.repo.userByEmail(g.email) : undefined;
    if (byEmail) {
      await withTx(this.pool, (tx) => this.repo.linkGoogle(tx, byEmail.id, g.subject, g.email));
      await this.repo.markEmailVerified(byEmail.id, g.email!);
      await this.repo.audit(this.pool, { actorUserId: byEmail.id, action: 'account.google_linked', targetType: 'user', targetId: byEmail.id });
      return this.completeLogin((await this.repo.userById(byEmail.id))!, 'google', idHash, ctx, false);
    }
    // New person: SAZO still needs surname, gender and date of birth (18+) before the account exists.
    const signupToken = await new SignJWT({ g })
      .setProtectedHeader({ alg: 'HS256' }).setAudience('sazo-google-signup').setIssuedAt().setExpirationTime('15m').sign(this.signupKey());
    return { status: 'needs_details', signupToken, suggested: { firstName: g.givenName, surname: g.familyName, email: g.email } };
  }

  async googleComplete(signupToken: string, d: PersonDetails, ctx: LoginContext = {}): Promise<LoginResult> {
    let g: GoogleProfile;
    try {
      g = (await jwtVerify(signupToken, this.signupKey(), { audience: 'sazo-google-signup', algorithms: ['HS256'] })).payload.g as GoogleProfile;
    } catch {
      throw new AuthError('invalid_link', 'This Google sign-up took too long. Start again');
    }
    const existing = await this.repo.userByGoogle(g.subject);
    if (existing) return this.completeLogin((await this.repo.userById(existing))!, 'google', this.identifierHash('email', g.email ?? g.subject), ctx, false);
    const email = g.email && g.emailVerified && !(await this.repo.userByEmail(g.email)) ? g.email : undefined;
    const id = await this.createAccount(d, { google: g, ...(email ? { email, emailVerified: true } : {}) });
    if (!id) throw new AuthError('account_exists', 'An account already uses this email. Log in instead');
    return this.completeLogin((await this.repo.userById(id))!, 'google', this.identifierHash('email', g.email ?? g.subject), ctx, true);
  }

  // ---------- details for older accounts and names

  /** Older accounts finish their details (gender and date of birth are set once, D-101). */
  async completeDetails(userId: string, d: PersonDetails): Promise<void> {
    const user = (await this.repo.userById(userId))!;
    this.dobOk(d.dateOfBirth);
    if (user.gender && user.dobCiphertext) {
      const same = user.gender === d.gender && this.keyring.decrypt(user.dobCiphertext, user.dobKeyVersion!) === d.dateOfBirth;
      if (!same) throw new AuthError('details_locked', 'Gender and date of birth can only be changed by SAZO staff. Contact SAZO');
    }
    await this.repo.setIdentityOnce(userId, d.gender, this.keyring.encrypt(d.dateOfBirth), this.keyring.current);
    await this.setNames(userId, d);
  }

  async setNames(userId: string, n: { surname: string; firstName: string; middleName?: string | undefined }): Promise<void> {
    const before = await this.repo.userById(userId);
    const next = { surname: n.surname, firstName: n.firstName, middleName: n.middleName ?? null, displayName: personDisplayName(n) };
    await this.repo.setNames(userId, next);
    await this.repo.audit(this.pool, { actorUserId: userId, action: 'account.names_changed', targetType: 'user', targetId: userId,
      details: { before: { surname: before?.surname, firstName: before?.firstName, middleName: before?.middleName }, after: { surname: next.surname, firstName: next.firstName, middleName: next.middleName } } });
  }

  /** For GET /me: the circle's initials and what an older account must still give. */
  async summary(userId: string): Promise<{ initials: string; needsDetails: string[] }> {
    const u = await this.repo.userById(userId);
    return {
      initials: personInitials(u ?? {}),
      needsDetails: !u ? [] : [...(!u.surname ? ['surname'] : []), ...(!u.firstName ? ['firstName'] : []), ...(!u.gender ? ['gender'] : []), ...(!u.dobCiphertext ? ['dateOfBirth'] : [])],
    };
  }

  dateOfBirth(user: UserRow): string | null {
    return user.dobCiphertext ? this.keyring.decrypt(user.dobCiphertext, user.dobKeyVersion!) : null;
  }

  /** Key rotation: move dates of birth to the current key. */
  async reencryptDobBatch(limit = 500): Promise<number> {
    const rows = await this.repo.dobsToReencrypt(this.keyring.current, limit);
    for (const r of rows) await this.repo.replaceDob(r.id, r.dobKeyVersion, this.keyring.encrypt(this.keyring.decrypt(r.dobCiphertext, r.dobKeyVersion)), this.keyring.current);
    return rows.length;
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
    // Signed out after SESSION_IDLE_HOURS without using the account. The clock is the last refresh: an
    // active person refreshes at least once per access-token lifetime, so allow one lifetime on top.
    if (s.idleSeconds > this.cfg.SESSION_IDLE_HOURS * 3600 + this.cfg.ACCESS_TOKEN_TTL_SECONDS) {
      await this.repo.revokeSession(s.id, 'idle');
      throw new AuthError('session_idle', `You were logged out after ${this.cfg.SESSION_IDLE_HOURS} hours without activity. Log in again.`);
    }
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
