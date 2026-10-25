// Authenticator app codes (RFC 6238): 6 digits, a new one every 30 seconds, SHA-1 as every common app expects
// (Google Authenticator, Microsoft Authenticator, Authy). SAZO staff use these for their second step (D-145).
import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new key: 20 random bytes, shown to the person as 32 letters and digits. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = h[h.length - 1]! & 15;
  const n = ((h[offset]! & 127) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD);

/**
 * The window the code belongs to, allowing one window either side for a phone clock that is a little off.
 * Undefined if the code is wrong. Callers refuse a window already used (no replays).
 */
export function matchTotp(secret: string, code: string, now = Date.now()): number | undefined {
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) if (totpAt(secret, s) === code) return s;
  return undefined;
}

/** The link the QR code holds: the app shows "SAZO (name)". */
export function otpauthUrl(secret: string, label: string): string {
  const issuer = 'SAZO';
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD}`;
}

/** Backup codes look like "k7m2p-9xq4t": lowercase, no 0/o/1/l to misread. */
export function newBackupCode(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = randomBytes(10);
  const s = [...b].map((x) => chars[x % chars.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export const normaliseBackupCode = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
