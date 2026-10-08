import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { KMS_CONTEXT, Keyring, loadKeyring, type KmsDecrypt } from './keyring.js';

const k = () => randomBytes(32);

describe('personal-data keyring', () => {
  it('encrypts with the current key and still decrypts older versions', () => {
    const v1 = k(); const v2 = k();
    const old = new Keyring(new Map([[1, v1]]), 1);
    const blob = old.encrypt('+256772123456');
    const both = new Keyring(new Map([[1, v1], [2, v2]]), 2);
    expect(both.decrypt(blob, 1)).toBe('+256772123456');
    const fresh = both.encrypt('Peter');
    expect(() => both.decrypt(fresh, 1)).toThrow();
    expect(both.decrypt(fresh, 2)).toBe('Peter');
    expect(() => new Keyring(new Map([[1, v1]]), 1).decrypt(fresh, 2)).toThrow(/version 2 is not loaded/);
  });

  it('loads data keys through KMS with the purpose bound to each key', async () => {
    const plain = k();
    const calls: Record<string, string>[] = [];
    const fake: KmsDecrypt = { decrypt: async (_blob, ctx) => { calls.push(ctx); return plain; } };
    const cfg = loadConfig({ PII_KEY_SOURCE: 'kms', PII_KMS_DATA_KEYS: `3:${Buffer.from('wrapped').toString('base64')}` });
    const ring = await loadKeyring(cfg, fake);
    expect(ring.current).toBe(3);
    expect(calls).toEqual([{ ...KMS_CONTEXT, version: '3' }]);
    expect(ring.decrypt(ring.encrypt('x'), 3)).toBe('x');
  });

  it('production refuses keys from plain settings', () => {
    const prod = { NODE_ENV: 'production', JWT_SECRET: 'j'.repeat(40), HMAC_SECRET: 'h'.repeat(40), SMS_PROVIDER: 'africastalking', AT_USERNAME: 'u', AT_API_KEY: 'k' };
    expect(() => loadConfig(prod)).toThrow(/PII_KEY_SOURCE=kms/);
    expect(() => loadConfig({ ...prod, PII_KEY_SOURCE: 'kms' })).toThrow(/PII_KMS_DATA_KEYS/);
    expect(loadConfig({ ...prod, PII_KEY_SOURCE: 'kms', PII_KMS_DATA_KEYS: '1:abc=' }).PII_KEY_SOURCE).toBe('kms');
  });
});
