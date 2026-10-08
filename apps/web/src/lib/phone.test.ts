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

describe('account screen helpers', () => {
  it('shows numbers the local way and names devices', async () => {
    const { localPhone, deviceName } = await import('./phone');
    expect(localPhone('+256772123456')).toBe('0772 123 456');
    expect(localPhone('+254712345678')).toBe('+254712345678');
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(deviceName(null)).toBe('Unknown device');
  });
});
