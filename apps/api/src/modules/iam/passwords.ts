// Password hashing with scrypt (memory-hard, built into Node). Stored as "scrypt$N$r$p$salt$hash" so the
// cost can be raised later; older hashes still verify.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (pw: string, salt: Buffer, len: number, o: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, o, (err, key) => (err ? reject(err) : resolve(key))));

const COST = { N: 2 ** 15, r: 8, p: 1 };
const KEYLEN = 64;
const maxmem = (N: number, r: number) => 256 * N * r + 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { ...COST, maxmem: maxmem(COST.N, COST.r) });
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const N = Number(n), R = Number(r), P = Number(p);
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spend the same time as a real check when there is no account, so timing doesn't reveal which emails exist. */
let dummy: Promise<string> | undefined;
export async function burnPasswordTime(password: string): Promise<void> {
  dummy ??= hashPassword('not-a-real-password');
  await verifyPassword(password, await dummy);
}
