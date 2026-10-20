// Notifications — module 8. Sends SMS from versioned templates and logs every message in `notify`
// without storing raw phone numbers (only an HMAC, DM-15).
import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB_POOL } from '../../platform/tokens.js';
import { EMAIL_SENDER, type EmailSender } from './email.js';
import { SMS_SENDER, type SmsSender } from './sms.js';

/** SMS templates (en-UG). Short, plain, and never containing personal data beyond what's needed. */
const TEMPLATES: Record<string, { version: number; body: string }> = {
  otp: { version: 1, body: 'Your SAZO code is {code}. It expires in 10 minutes. Never share it with anyone.' },
  second_step: { version: 1, body: 'Your SAZO sign-in code is {code}. It expires in 10 minutes. Never share it. SAZO will never ask you for it.' },
  org_approved: { version: 1, body: '{organisation} is approved on SAZO. You can now record jobs in the SAZO Garage app.' },
  org_info_requested: { version: 1, body: 'SAZO needs more information about {organisation}: {reason}. Reply on the SAZO website.' },
  org_rejected: { version: 1, body: 'SAZO could not approve {organisation} at this time. Contact SAZO support for details.' },
  org_suspended: { version: 1, body: '{organisation} has been suspended on SAZO and cannot record history for now. Contact SAZO support.' },
  identity_approved: { version: 1, body: 'SAZO checked your National ID. You can now manage your business on SAZO.' },
  identity_rejected: { version: 1, body: 'SAZO could not accept your National ID: {reason}. Send it again from your business page on SAZO.' },
  booking_requested: { version: 1, body: 'SAZO: a buyer asked {organisation} to inspect car {plate} around {date}. Open the SAZO Garage app to accept or decline.' },
  booking_accepted: { version: 1, body: '{organisation} will inspect car {plate} on {when}. See the details on SAZO.' },
  booking_declined: { version: 1, body: '{organisation} cannot inspect car {plate}: {reason}. You can ask another inspector on SAZO.' },
  booking_cancelled: { version: 1, body: 'SAZO: the buyer cancelled the inspection of car {plate}.' },
  phone_change_code: { version: 1, body: 'Your SAZO code to move your account to this number is {code}. It expires in 10 minutes. Never share it.' },
  phone_changed: { version: 1, body: 'Your SAZO account now uses a different phone number. If this was not you, contact SAZO at once.' },
  account_deleted: { version: 1, body: 'Your SAZO account has been deleted. Thank you for using SAZO.' },
  ownership_approved: { version: 1, body: 'SAZO confirmed you as the owner of {plate}. See it under My cars on SAZO.' },
  ownership_rejected: { version: 1, body: 'SAZO could not confirm you as the owner of {plate} from the logbook photo. You can try again with a clearer photo.' },
  staff_added: { version: 1, body: '{organisation} added you to their team on SAZO. Sign in with this phone number to start recording jobs.' },
  // D-058: what was recorded, and a link to confirm or dispute. No costs, no other personal data.
  attestation: { version: 1, body: '{garage} recorded {work} on {plate} at {km} km on {date}. Was this your car? Confirm or dispute: {link}' },
  // C-02: the same question when two-way SMS is on — the customer can simply reply 1 or 2.
  attestation_reply: { version: 1, body: '{garage} recorded {work} on {plate} at {km} km on {date}. Was this your car? Reply 1 for yes, 2 for no. Or open: {link}' },
  reply_thanks_yes: { version: 1, body: 'Thank you. SAZO noted that the {date} visit to {garage} was your car ({plate}).' },
  reply_thanks_no: { version: 1, body: 'Thank you. SAZO noted that the {date} visit to {garage} was NOT your car ({plate}). SAZO will look into it.' },
  reply_several: { version: 1, body: 'You have {count} garage visits waiting for an answer. Please answer each one with the link in its message.' },
  reply_none: { version: 1, body: 'SAZO has no garage visit waiting for an answer from this number.' },
  reply_help: { version: 1, body: 'Reply 1 if the garage visit was your car, or 2 if it was not. Reply STOP to get no more of these messages.' },
  reply_stopped: { version: 1, body: 'SAZO will not text you about garage visits any more. You can turn this back on in your SAZO account settings.' },
};

export type SmsTemplate = keyof typeof TEMPLATES;

/** Email templates (en-UG). Links are single-use credentials: never logged. */
const EMAILS: Record<string, { version: number; subject: string; body: string }> = {
  verify_email: { version: 1, subject: 'Confirm your email for SAZO',
    body: 'Hello {name},\n\nConfirm this email address for your SAZO account:\n{link}\n\nThe link works once and expires in 24 hours. If you did not ask for this, ignore this email.\n\nSAZO' },
  reset_password: { version: 1, subject: 'Reset your SAZO password',
    body: 'Hello {name},\n\nSomeone (hopefully you) asked to reset the password for your SAZO account. Choose a new password here:\n{link}\n\nThe link works once and expires in 1 hour. If this was not you, ignore this email. Your password has not changed.\n\nSAZO' },
  second_step: { version: 1, subject: 'Your SAZO sign-in code',
    body: 'Hello {name},\n\nYour SAZO sign-in code is {code}. It expires in 10 minutes. Never share it with anyone. SAZO will never ask you for it.\n\nIf you are not signing in, change your password at once.\n\nSAZO' },
  password_changed: { version: 1, subject: 'Your SAZO password was changed',
    body: 'Hello {name},\n\nThe password for your SAZO account was just changed. If this was not you, reset it at once from the sign-in page and contact SAZO.\n\nSAZO' },
};

const render = (body: string, params: Record<string, string | number>) =>
  body.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  phoneHash(phoneE164: string): Buffer {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(phoneE164).digest();
  }

  /** Send a templated SMS to a phone number. The number is used for delivery only and never stored. */
  async sendSmsToPhone(phoneE164: string, template: SmsTemplate, params: Record<string, string | number>,
    purpose: 'otp' | 'attestation' | 'account' | 'reminder', toUserId?: string | null,
    extra: { toPartyId?: string; relatedType?: string; relatedId?: string } = {}): Promise<boolean> {
    const t = TEMPLATES[template]!;
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO notify.outbound_messages (channel, to_user_id, to_party_id, to_phone_hash, template_code, template_version, params, purpose,
         related_type, related_id, status)
       VALUES ('sms', $1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued') RETURNING id`,
      // Never log secrets: no sign-in codes, and no confirmation links (they are single-use credentials).
      [toUserId ?? null, extra.toPartyId ?? null, this.phoneHash(phoneE164), template, t.version,
        JSON.stringify(purpose === 'otp' ? {} : { ...params, ...('link' in params ? { link: '[redacted]' } : {}) }), purpose,
        extra.relatedType ?? null, extra.relatedId ?? null],
    );
    const result = await this.sms.send(phoneE164, render(t.body, params));
    await this.pool.query(
      `UPDATE notify.outbound_messages SET status = $2, provider = $3, provider_message_id = $4, failed_reason = $5, sent_at = now() WHERE id = $1`,
      [rows[0]!.id, result.ok ? 'sent' : 'failed', result.provider, result.providerMessageId ?? null, result.error ?? null],
    );
    return result.ok;
  }

  /**
   * Log an SMS someone sent to SAZO (C-02). Only a keyed hash of the number is kept. Returns undefined when the
   * provider already delivered this message (providers retry), so a reply is acted on once.
   */
  async recordInbound(fromE164: string, body: string, providerMessageId?: string): Promise<string | undefined> {
    if (providerMessageId) {
      const seen = await this.pool.query('SELECT 1 FROM notify.inbound_replies WHERE provider_message_id = $1', [providerMessageId]);
      if (seen.rowCount) return undefined;
    }
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO notify.inbound_replies (channel, from_phone_hash, body, provider_message_id) VALUES ('sms', $1, $2, $3) RETURNING id`,
      [this.phoneHash(fromE164), body.slice(0, 500), providerMessageId ?? null]);
    return rows[0]!.id;
  }

  async markInboundProcessed(id: string): Promise<void> {
    await this.pool.query('UPDATE notify.inbound_replies SET processed_at = now() WHERE id = $1', [id]);
  }

  /** Send a templated email. The address is used for delivery only; the log keeps an HMAC of it. */
  async sendEmail(to: string, template: keyof typeof EMAILS, params: Record<string, string | number>,
    purpose: 'otp' | 'account', toUserId?: string | null): Promise<boolean> {
    const t = EMAILS[template]!;
    const address = to.trim().toLowerCase();
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO notify.outbound_messages (channel, to_user_id, to_email_hash, template_code, template_version, params, purpose, status)
       VALUES ('email', $1, $2, $3, $4, '{}', $5, 'queued') RETURNING id`,
      [toUserId ?? null, createHmac('sha256', this.cfg.HMAC_SECRET).update(address).digest(), template, t.version, purpose]);
    const result = await this.email.send({ to: address, subject: render(t.subject, params), text: render(t.body, params) });
    await this.pool.query(
      `UPDATE notify.outbound_messages SET status = $2, provider = $3, provider_message_id = $4, failed_reason = $5, sent_at = now() WHERE id = $1`,
      [rows[0]!.id, result.ok ? 'sent' : 'failed', result.provider, result.providerMessageId ?? null, result.error ?? null]);
    return result.ok;
  }
}
