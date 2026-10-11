import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.js';

describe('password hashing', () => {
  it('verifies the right password only, and never stores it', async () => {
    const h = await hashPassword('river-stone-7');
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(h).not.toContain('river');
    expect(await verifyPassword('river-stone-7', h)).toBe(true);
    expect(await verifyPassword('river-stone-8', h)).toBe(false);
    expect(await verifyPassword('river-stone-7', 'garbage')).toBe(false);
    expect(await hashPassword('river-stone-7')).not.toBe(h);
  });
});
