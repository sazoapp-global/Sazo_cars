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
