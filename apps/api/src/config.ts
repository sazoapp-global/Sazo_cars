import { z } from 'zod';

const DEV_SECRET = 'dev-only-secret-change-me-dev-only-secret';
/** A fixed 32-byte key, base64 — development only. */
const DEV_PII_KEY = Buffer.from('dev-only-pii-key-32-bytes-long!!').toString('base64');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default('postgres://sazo:sazo@127.0.0.1:5432/sazo'),
  /** True while all records come from simulated sources (D-002, D-011). */
  SIMULATED_DATA: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  /** Signs access tokens (HS256). */
  JWT_SECRET: z.string().min(32).default(DEV_SECRET),
  /** Keys the HMACs of sign-in codes and phone numbers (DM-15). */
  HMAC_SECRET: z.string().min(32).default(DEV_SECRET),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** 'console' keeps SMS in a local inbox (development/tests); 'africastalking' sends real SMS. */
  SMS_PROVIDER: z.enum(['console', 'africastalking']).default('console'),
  AT_USERNAME: z.string().optional(),
  AT_API_KEY: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),
  AT_SANDBOX: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  /**
   * Keys for names and phone numbers in the personal-data store (DM-15) — see platform/keyring.ts.
   * env: PII_KEYS="1:<base64>,2:<base64>" (or PII_ENCRYPTION_KEY as version 1). kms: PII_KMS_DATA_KEYS, decrypted by AWS KMS at start-up.
   */
  PII_KEY_SOURCE: z.enum(['env', 'kms']).default('env'),
  PII_ENCRYPTION_KEY: z.string().default(DEV_PII_KEY)
    .refine((k) => Buffer.from(k, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),
  PII_KEYS: z.string().optional(),
  PII_KMS_DATA_KEYS: z.string().optional(),
  /** The key version new values are encrypted with (default: the highest available). */
  PII_CURRENT_KEY_VERSION: z.coerce.number().int().positive().optional(),
  /** AWS KMS key that wraps the data keys (needed only to make new data keys: npm run pii:new-key). */
  KMS_KEY_ID: z.string().optional(),
  AWS_REGION: z.string().optional(),
  /** Where evidence photos are stored (write-once). Local folder now; S3 later. */
  EVIDENCE_DIR: z.string().default('./var/evidence'),
  /** Public web address used in SMS links, e.g. the owner-confirmation page. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3001'),
  /** The address of this API as seen by phones (used in upload URLs). */
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
});

export type AppConfig = z.infer<typeof Env>;
export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    if (cfg.JWT_SECRET === DEV_SECRET || cfg.HMAC_SECRET === DEV_SECRET) throw new Error('Set JWT_SECRET and HMAC_SECRET in production');
    if (cfg.SMS_PROVIDER === 'console') throw new Error('SMS_PROVIDER=console is not allowed in production');
    // In production the personal-data keys come from a key vault, never from plain settings (stolen settings + a stolen database must not be enough).
    if (cfg.PII_KEY_SOURCE !== 'kms') throw new Error('Set PII_KEY_SOURCE=kms and PII_KMS_DATA_KEYS in production');
  }
  if (cfg.PII_KEY_SOURCE === 'kms' && !cfg.PII_KMS_DATA_KEYS) throw new Error('PII_KEY_SOURCE=kms needs PII_KMS_DATA_KEYS');
  if (cfg.SMS_PROVIDER === 'africastalking' && (!cfg.AT_USERNAME || !cfg.AT_API_KEY)) {
    throw new Error("SMS_PROVIDER=africastalking needs AT_USERNAME and AT_API_KEY");
  }
  return cfg;
}
