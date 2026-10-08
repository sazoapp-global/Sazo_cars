// The restricted personal-data store (DM-2, DM-15). Names and phone numbers are encrypted by the app
// (AES-256-GCM with versioned keys from platform/keyring.ts — AWS KMS in production) and phones are
// matched by HMAC, so other tables only hold a party id.
import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { PII_KEYRING, type Keyring } from '../../platform/keyring.js';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

@Injectable()
export class PartiesService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(PII_KEYRING) private readonly keyring: Keyring,
  ) {}

  /** Same keyed hash as Notifications uses, so a phone can be matched across modules without decrypting. */
  phoneHash(phoneE164: string): Buffer {
    return createHmac('sha256', this.cfg.HMAC_SECRET).update(phoneE164).digest();
  }

  private encrypt(text: string): Buffer {
    return this.keyring.encrypt(text);
  }

  private decrypt(blob: Buffer | null, version: number): string | undefined {
    return blob ? this.keyring.decrypt(blob, version) : undefined;
  }

  /**
   * Key rotation: re-encrypt up to `limit` records still on an older key with the current one.
   * Returns how many were done (run until 0: npm run pii:rotate -w @sazo/api).
   */
  async reencryptBatch(limit = 500): Promise<number> {
    const { rows } = await this.pool.query<{ id: string; name_ciphertext: Buffer | null; phone_ciphertext: Buffer | null; key_version: number }>(
      `SELECT id, name_ciphertext, phone_ciphertext, key_version FROM pii.parties
        WHERE key_version <> $1 AND erased_at IS NULL AND (name_ciphertext IS NOT NULL OR phone_ciphertext IS NOT NULL) LIMIT $2`,
      [this.keyring.current, limit]);
    for (const r of rows) {
      const name = this.decrypt(r.name_ciphertext, r.key_version);
      const phone = this.decrypt(r.phone_ciphertext, r.key_version);
      await this.pool.query(
        `UPDATE pii.parties SET name_ciphertext = $2, phone_ciphertext = $3, key_version = $4 WHERE id = $1 AND key_version = $5`,
        [r.id, name ? this.encrypt(name) : null, phone ? this.encrypt(phone) : null, this.keyring.current, r.key_version]);
    }
    return rows.length;
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
      [p.name ? this.encrypt(p.name) : null, p.phone ? this.encrypt(p.phone) : null, p.phone ? this.phoneHash(p.phone) : null, this.keyring.current],
    );
    return rows[0]!.id;
  }

  /**
   * A person exactly as one business told SAZO about them (e.g. a garage's customer): always a new record, so a
   * business only ever sees the name it typed itself — never a name another business typed for the same phone
   * (Security S2). Opt-outs and erasure still apply, because they work on every record with that phone.
   */
  async recordPerson(p: { name?: string; phone?: string }, sql: Sql = this.pool): Promise<string> {
    const { rows } = await sql.query<{ id: string }>(
      `INSERT INTO pii.parties (kind, name_ciphertext, phone_ciphertext, phone_hash, key_version) VALUES ('person', $1, $2, $3, $4) RETURNING id`,
      [p.name ? this.encrypt(p.name) : null, p.phone ? this.encrypt(p.phone) : null, p.phone ? this.phoneHash(p.phone) : null, this.keyring.current]);
    return rows[0]!.id;
  }

  /** Record consent — unless the person has told SAZO not to text them (their choice wins over a garage's form). */
  async recordConsent(partyId: string, purpose: 'attestation_sms' | 'service_reminders' | 'marketing', channel: string, sql: Sql = this.pool): Promise<void> {
    await sql.query(
      `INSERT INTO pii.party_consents (party_id, purpose, channel)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM pii.party_consents WHERE party_id = $1 AND purpose = $2 AND revoked_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM pii.parties p JOIN pii.parties me ON me.id = $1
                          WHERE (p.id = me.id OR (me.phone_hash IS NOT NULL AND p.phone_hash = me.phone_hash)) AND p.sms_opt_out_at IS NOT NULL)`,
      [partyId, purpose, channel]);
  }

  async hasConsent(partyId: string, purpose: 'attestation_sms'): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM pii.party_consents c JOIN pii.parties p ON p.id = c.party_id
        WHERE c.party_id = $1 AND c.purpose = $2 AND c.revoked_at IS NULL AND p.sms_opt_out_at IS NULL AND p.erased_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM pii.parties o WHERE p.phone_hash IS NOT NULL AND o.phone_hash = p.phone_hash AND o.sms_opt_out_at IS NOT NULL)`, [partyId, purpose]);
    return rows.length > 0;
  }

  /** "Text me to confirm garage visits" on or off, for the person with this phone (account settings). */
  async setVisitTexts(phone: string, allowed: boolean): Promise<void> {
    await this.upsertPerson({ phone }); // so the choice is stored even if no business has mentioned this phone yet
    const hash = this.phoneHash(phone);
    await this.pool.query(`UPDATE pii.parties SET sms_opt_out_at = CASE WHEN $2 THEN NULL ELSE now() END WHERE phone_hash = $1 AND erased_at IS NULL`, [hash, allowed]);
    if (!allowed) await this.pool.query(`UPDATE pii.party_consents SET revoked_at = now() WHERE revoked_at IS NULL AND party_id IN (SELECT id FROM pii.parties WHERE phone_hash = $1)`, [hash]);
  }

  async visitTextsAllowed(phone: string): Promise<boolean> {
    const { rows } = await this.pool.query(`SELECT 1 FROM pii.parties WHERE phone_hash = $1 AND sms_opt_out_at IS NOT NULL AND erased_at IS NULL`, [this.phoneHash(phone)]);
    return rows.length === 0;
  }

  /**
   * Erase what SAZO holds about the person with this phone: name and number are deleted, consents revoked.
   * Records that mention them stay (history is append-only) but no longer point to anyone identifiable.
   */
  async eraseByPhone(phone: string): Promise<void> {
    const hash = this.phoneHash(phone);
    await this.pool.query(`UPDATE pii.party_consents SET revoked_at = now() WHERE revoked_at IS NULL AND party_id IN (SELECT id FROM pii.parties WHERE phone_hash = $1)`, [hash]);
    await this.pool.query(
      `UPDATE pii.parties SET name_ciphertext = NULL, phone_ciphertext = NULL, phone_hash = NULL, erasure_requested_at = now(), erased_at = now()
        WHERE phone_hash = $1 AND erased_at IS NULL`, [hash]);
  }

  /** Does this party's phone match a number (compared by keyed hash; nothing is decrypted)? */
  async phoneMatches(partyId: string, phoneE164: string): Promise<boolean> {
    const { rows } = await this.pool.query('SELECT 1 FROM pii.parties WHERE id = $1 AND phone_hash = $2 AND erased_at IS NULL', [partyId, this.phoneHash(phoneE164)]);
    return rows.length > 0;
  }

  /** Decrypt for an allowed purpose (sending an SMS, showing the garage its own customer). */
  async reveal(partyId: string): Promise<{ name?: string; phone?: string } | undefined> {
    const { rows } = await this.pool.query<{ name_ciphertext: Buffer | null; phone_ciphertext: Buffer | null; erased_at: Date | null; key_version: number }>(
      'SELECT name_ciphertext, phone_ciphertext, erased_at, key_version FROM pii.parties WHERE id = $1', [partyId]);
    if (!rows[0] || rows[0].erased_at) return undefined;
    return { name: this.decrypt(rows[0].name_ciphertext, rows[0].key_version), phone: this.decrypt(rows[0].phone_ciphertext, rows[0].key_version) };
  }
}

/** "+256772123456" → "+256 77• ••• 456" for screens that only need to recognise the number. */
export const maskPhone = (p?: string): string | undefined => (p ? `${p.slice(0, 4)} ${p.slice(4, 6)}• ••• ${p.slice(-3)}` : undefined);
