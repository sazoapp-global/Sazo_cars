import { describe, expect, it } from 'vitest';
import { safeNext, toE164 } from './phone';

describe('phone input', () => {
  it('accepts the ways Ugandans write numbers', () => {
    for (const v of ['0772 123 456', '772123456', '256772123456', '+256 772-123-456']) expect(toE164(v)).toBe('+256772123456');
    expect(toE164('12345')).toBeUndefined();
  });
});

describe('after sign-in destination', () => {
  it('only allows paths on this site', () => {
    expect(safeNext('/v/SZV-AAAA-BBBB')).toBe('/v/SZV-AAAA-BBBB');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', undefined, 42]) expect(safeNext(bad)).toBe('/');
  });
});
