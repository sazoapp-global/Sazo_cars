import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, matchTotp, newBackupCode, normaliseBackupCode, totpAt } from './totp.js';

describe('authenticator codes (RFC 6238)', () => {
  // The RFC's test key "12345678901234567890"; its 8-digit answers end in these 6 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('matches the published test values', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpAt(secret, Math.floor(1234567890 / 30))).toBe('005924');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
  });
  it('allows one window either side, no more', () => {
    const now = 1234567890_000;
    const step = Math.floor(now / 30_000);
    expect(matchTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(matchTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(matchTotp(secret, totpAt(secret, step + 2), now)).toBeUndefined();
  });
  it('backup codes are easy to read and to type back', () => {
    const c = newBackupCode();
    expect(c).toMatch(/^[a-km-np-z2-9]{5}-[a-km-np-z2-9]{5}$/);
    expect(normaliseBackupCode(` ${c.toUpperCase().replace('-', ' ')} `)).toBe(c.replace('-', ''));
  });
});
