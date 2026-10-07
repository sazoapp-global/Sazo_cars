// Notifications — module 8. Sends SMS from versioned templates and logs every message in `notify`
// without storing raw phone numbers (only an HMAC, DM-15).
import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB_POOL } from '../../platform/tokens.js';
import { SMS_SENDER, type SmsSender } from './sms.js';

/** SMS templates (en-UG). Short, plain, and never containing personal data beyond what's needed. */
const TEMPLATES: Record<string, { version: number; body: string }> = {
  otp: { version: 1, body: 'Your SAZO code is {code}. It expires in 10 minutes. Never share it with anyone.' },
};

const render = (body: string, params: Record<string, string | number>) =>
  body.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  phoneHash(phoneE164: string): Buffer {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(phoneE164).digest();
  }

  /** Send a templated SMS to a phone number. The number is used for delivery only and never stored. */
  async sendSmsToPhone(phoneE164: string, template: keyof typeof TEMPLATES, params: Record<string, string | number>,
    purpose: 'otp' | 'attestation' | 'account' | 'reminder', toUserId?: string | null): Promise<boolean> {
    const t = TEMPLATES[template]!;
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO notify.outbound_messages (channel, to_user_id, to_phone_hash, template_code, template_version, params, purpose, status)
       VALUES ('sms', $1, $2, $3, $4, $5, $6, 'queued') RETURNING id`,
      // Never log secrets such as sign-in codes in params.
      [toUserId ?? null, this.phoneHash(phoneE164), template, t.version, JSON.stringify(purpose === 'otp' ? {} : params), purpose],
    );
    const result = await this.sms.send(phoneE164, render(t.body, params));
    await this.pool.query(
      `UPDATE notify.outbound_messages SET status = $2, provider = $3, provider_message_id = $4, failed_reason = $5, sent_at = now() WHERE id = $1`,
      [rows[0]!.id, result.ok ? 'sent' : 'failed', result.provider, result.providerMessageId ?? null, result.error ?? null],
    );
    return result.ok;
  }
}
