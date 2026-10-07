import { z } from 'zod';

const DEV_SECRET = 'dev-only-secret-change-me-dev-only-secret';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default('postgres://sazo:sazo@localhost:5432/sazo'),
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
  }
  if (cfg.SMS_PROVIDER === 'africastalking' && (!cfg.AT_USERNAME || !cfg.AT_API_KEY)) {
    throw new Error("SMS_PROVIDER=africastalking needs AT_USERNAME and AT_API_KEY");
  }
  return cfg;
}
