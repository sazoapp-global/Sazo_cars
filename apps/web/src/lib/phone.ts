/** Ugandan-friendly phone input → E.164. Accepts 0772 123456, 772123456, 256772123456, +256 772 123 456. */
export function toE164(input: string): string | undefined {
  const digits = input.replace(/[\s\-().]/g, '');
  let e164: string;
  if (digits.startsWith('+')) e164 = digits;
  else if (digits.startsWith('256')) e164 = `+${digits}`;
  else if (digits.startsWith('0')) e164 = `+256${digits.slice(1)}`;
  else if (/^[7]\d{8}$/.test(digits)) e164 = `+256${digits}`;
  else return undefined;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : undefined;
}

/** Only same-site paths are allowed as a post-sign-in destination (no open redirects). */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

/** "+256772123456" → "0772 123 456" (how people in Uganda write it); other countries as given. */
export function localPhone(e164: string): string {
  return e164.startsWith('+256') && e164.length === 13 ? `0${e164.slice(4, 7)} ${e164.slice(7, 10)} ${e164.slice(10)}` : e164;
}

/** "Mozilla/5.0 (Linux; Android 14; …) Chrome/…" → "Chrome on Android". Good enough to recognise a device. */
export function deviceName(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /node|undici|curl/i.test(ua) ? 'An app' : 'A browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
