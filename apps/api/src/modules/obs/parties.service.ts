// The restricted personal-data store (DM-2, DM-15). Names and phone numbers are encrypted by the app
// (AES-256-GCM; KMS envelope later) and phones are matched by HMAC, so other tables only hold a party id.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

const KEY_VERSION = 1;

@Injectable()
export class PartiesService {
  private readonly key: Buffer;

  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {
    this.key = Buffer.from(cfg.PII_ENCRYPTION_KEY, 'base64');
  }

  /** Same keyed hash as Notifications uses, so a phone can be matched across modules without decrypting. */
  phoneHash(phoneE164: string): Buffer {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(phoneE164).digest();
  }

  private encrypt(text: string): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]); // iv(12) | tag(16) | ciphertext
  }

  private decrypt(blob: Buffer | null): string | undefined {
    if (!blob) return undefined;
    const d = createDecipheriv('aes-256-gcm', this.key, blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
  }

  /**
   * Find the person by phone (if given) or record a new one. An existing party keeps its stored name:
   * a garage typing a different spelling must not overwrite someone's personal record.
   */
  async upsertPerson(p: { name?: string; phone?: string }, sql: Sql = this.pool): Promise<string> {
    if (p.phone) {
      const { rows } = await sql.query<{ id: string }>(
        'SELECT id FROM pii.parties WHERE phone_hash = $1 AND erased_at IS NULL ORDER BY created_at LIMIT 1', [this.phoneHash(p.phone)]);
      if (rows[0]) return rows[0].id;
    }
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO pii.parties (kind, name_ciphertext, phone_ciphertext, phone_hash, key_version) VALUES ('person', $1, $2, $3, $4) RETURNING id`,
      [p.name ? this.encrypt(p.name) : null, p.phone ? this.encrypt(p.phone) : null, p.phone ? this.phoneHash(p.phone) : null, KEY_VERSION],
    );
    return rows[0]!.id;
  }

  async recordConsent(partyId: string, purpose: 'attestation_sms' | 'service_reminders' | 'marketing', channel: string, sql: Sql = this.pool): Promise<void> {
    await sql.query(
      `INSERT INTO pii.party_consents (party_id, purpose, channel)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM pii.party_consents WHERE party_id = $1 AND purpose = $2 AND revoked_at IS NULL)`,
      [partyId, purpose, channel]);
  }

  async hasConsent(partyId: string, purpose: 'attestation_sms'): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT 1 FROM pii.party_consents WHERE party_id = $1 AND purpose = $2 AND revoked_at IS NULL', [partyId, purpose]);
    return rows.length > 0;
  }

  /** Decrypt for an allowed purpose (sending an SMS, showing the garage its own customer). */
  async reveal(partyId: string): Promise<{ name?: string; phone?: string } | undefined> {
    const { rows } = await this.pool.query<{ name_ciphertext: Buffer | null; phone_ciphertext: Buffer | null; erased_at: Date | null }>(
      'SELECT name_ciphertext, phone_ciphertext, erased_at FROM pii.parties WHERE id = $1', [partyId]);
    if (!rows[0] || rows[0].erased_at) return undefined;
    return { name: this.decrypt(rows[0].name_ciphertext), phone: this.decrypt(rows[0].phone_ciphertext) };
  }
}

/** "+256772123456" → "+256 77• ••• 456" for screens that only need to recognise the number. */
export const maskPhone = (p?: string): string | undefined => (p ? `${p.slice(0, 4)} ${p.slice(4, 6)}• ••• ${p.slice(-3)}` : undefined);
