// Keys for the personal-data store (names and phone numbers, DM-15).
//
// Every encrypted value is stored with the version of the key that encrypted it, so keys can be rotated:
// a new version encrypts from then on, older versions still decrypt, and `npm run pii:rotate` re-encrypts
// old rows. Two ways to provide the keys:
//   • env (development, tests): PII_KEYS="1:<base64 32 bytes>,2:<…>" (or the older PII_ENCRYPTION_KEY = version 1).
//   • kms (production): PII_KMS_DATA_KEYS="1:<base64 KMS ciphertext>,…". Each data key is stored only in its
//     encrypted form; at start-up AWS KMS decrypts it (the KMS master key never leaves KMS), and the plain key
//     lives only in this process's memory. Stealing the database and the server settings is not enough.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config.js';

export const PII_KEYRING = Symbol('PII_KEYRING');
/** Ties every SAZO data key to its purpose: KMS refuses to decrypt it for anything else. */
export const KMS_CONTEXT = { app: 'sazo', purpose: 'pii' } as const;

export interface KmsDecrypt { decrypt(ciphertext: Buffer, context: Record<string, string>): Promise<Buffer> }

/** "1:abc,2:def" → Map(1 → "abc", 2 → "def"). */
export function parseVersioned(spec: string, name: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const part of spec.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+):(.+)$/);
    if (!m) throw new Error(`${name}: each entry must look like <version>:<base64>`);
    out.set(Number(m[1]), m[2]!);
  }
  if (!out.size) throw new Error(`${name} is empty`);
  return out;
}

export class Keyring {
  constructor(private readonly keys: Map<number, Buffer>, readonly current: number) {
    for (const [v, k] of keys) if (k.length !== 32) throw new Error(`PII key version ${v} must be 32 bytes`);
    if (!keys.has(current)) throw new Error(`PII key version ${current} is not available`);
  }

  get versions(): number[] { return [...this.keys.keys()].sort((a, b) => a - b); }

  /** AES-256-GCM: iv(12) | tag(16) | ciphertext, with the current key. */
  encrypt(text: string): Buffer {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.keys.get(this.current)!, iv);
    const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  }

  decrypt(blob: Buffer, version: number): string {
    const key = this.keys.get(version);
    if (!key) throw new Error(`PII key version ${version} is not loaded — add it back to the configuration`);
    const d = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
  }
}

async function awsKms(region: string | undefined): Promise<KmsDecrypt> {
  const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
  const client = new KMSClient(region ? { region } : {});
  return {
    async decrypt(ciphertext, context) {
      const r = await client.send(new DecryptCommand({ CiphertextBlob: ciphertext, EncryptionContext: context }));
      if (!r.Plaintext) throw new Error('KMS returned no key');
      return Buffer.from(r.Plaintext);
    },
  };
}

export async function loadKeyring(cfg: AppConfig, kms?: KmsDecrypt): Promise<Keyring> {
  const keys = new Map<number, Buffer>();
  if (cfg.PII_KEY_SOURCE === 'kms') {
    const encrypted = parseVersioned(cfg.PII_KMS_DATA_KEYS ?? '', 'PII_KMS_DATA_KEYS');
    const client = kms ?? (await awsKms(cfg.AWS_REGION));
    for (const [v, blob] of encrypted) keys.set(v, await client.decrypt(Buffer.from(blob, 'base64'), { ...KMS_CONTEXT, version: String(v) }));
  } else {
    const plain = cfg.PII_KEYS ? parseVersioned(cfg.PII_KEYS, 'PII_KEYS') : new Map([[1, cfg.PII_ENCRYPTION_KEY]]);
    for (const [v, k] of plain) keys.set(v, Buffer.from(k, 'base64'));
  }
  return new Keyring(keys, cfg.PII_CURRENT_KEY_VERSION ?? Math.max(...keys.keys()));
}
