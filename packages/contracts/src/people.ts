// People and accounts (D-100 – D-105): tidying what people type, how names are shown, the sign-up details,
// the 18+ rule and the password rules. Shared by the API, the website and the phone app so all three agree.
import { z } from 'zod';

// ------------------------------------------------------------------ tidying input (D-103)

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const capitalise = (w: string) => (w ? w.charAt(0).toLocaleUpperCase('en') + w.slice(1).toLocaleLowerCase('en') : w);

/** A person's name: each part capitalised, hyphens and apostrophes kept. "mIKE o'neil-nakato" → "Mike O'Neil-Nakato". */
export function tidyName(s: string): string {
  return collapse(s).split(' ').map((word) => word.split('-').map((part) => part.split("'").map(capitalise).join("'")).join('-')).join(' ');
}

/** A place or district: each word capitalised. "kampala central" → "Kampala Central". */
export const tidyPlace = tidyName;

/** A business name: each word capitalised, but words typed all in capitals kept ("MTN motors ltd" → "MTN Motors Ltd"). */
export function tidyBusinessName(s: string): string {
  return collapse(s).split(' ').map((w) => (w.length >= 2 && /[A-Z]/.test(w) && w === w.toUpperCase() ? w : tidyName(w))).join(' ');
}

/** Free text (descriptions, notes): extra spaces removed, first letter of each sentence capitalised; nothing lower-cased. */
export function tidySentence(s: string): string {
  const text = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.replace(/(^|[.!?]\s+|\n)(\p{Ll})/gu, (_, before: string, ch: string) => before + ch.toLocaleUpperCase('en'));
}

export const tidyEmail = (s: string) => s.trim().toLowerCase();

// ------------------------------------------------------------------ names shown (D-103)

export interface PersonName { surname?: string | null; firstName?: string | null; middleName?: string | null }

/** Shown everywhere as surname, middle initial, first name: "Anguzu J. Mike" (or "Anguzu Mike"). */
export function personDisplayName(n: PersonName): string {
  const middle = n.middleName?.trim() ? `${n.middleName.trim().charAt(0).toLocaleUpperCase('en')}.` : '';
  return [n.surname, middle, n.firstName].map((x) => x?.trim()).filter(Boolean).join(' ');
}

/** The circle: first letter of the surname and of the first name — "AM" for Mike Anguzu. */
export function personInitials(n: PersonName & { displayName?: string }): string {
  const s = n.surname?.trim().charAt(0) ?? '';
  const f = n.firstName?.trim().charAt(0) ?? '';
  if (s || f) return (s + f).toLocaleUpperCase('en');
  const parts = (n.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0)).join('').toLocaleUpperCase('en') || '?';
}

// ------------------------------------------------------------------ age (D-101)

export const MINIMUM_AGE = 18;

/** Whole years between a YYYY-MM-DD date of birth and `today` (default now, in UTC). */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) age--;
  return age;
}

const realDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// ------------------------------------------------------------------ passwords (D-105)

export const PASSWORD_MIN = 8;
export const SENSITIVE_PASSWORD_MIN = 12;

/** The most common passwords (and ones a Ugandan attacker would try first). Refused for everyone. */
const COMMON = new Set(`12345678 123456789 1234567890 12345678910 password password1 password123 passw0rd qwerty123 qwertyuiop 11111111 00000000
  88888888 abcd1234 abc12345 iloveyou welcome1 welcome123 admin123 administrator letmein1 sunshine princess football monkey123 dragon123
  baseball1 trustno1 superman 1q2w3e4r 1qaz2wsx zaq12wsx asdfghjk asdf1234 qwer1234 changeme 123123123 987654321 147258369 password!
  uganda123 kampala1 kampala123 uganda2024 uganda2025 uganda2026 sazo1234 sazo12345 mtnmomo1 airtel123 jesus123 god12345 blessed1
  123qwe123 1234qwer qwerty12 qwertyui 12qwaszx p@ssw0rd p@ssword pa$$word`.split(/\s+/).filter(Boolean));

/** Problems with a new password, or [] if it is acceptable. `sensitive` = managers, dealer staff, partner data entry, SAZO staff. */
export function passwordProblems(password: string, opts: { sensitive: boolean; email?: string | null; names?: string[] }): string[] {
  const min = opts.sensitive ? SENSITIVE_PASSWORD_MIN : PASSWORD_MIN;
  const out: string[] = [];
  if (password.length < min) out.push(`Use at least ${min} characters`);
  if (password.length > 128) out.push('Use at most 128 characters');
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) out.push('This password is too common. Choose another');
  const local = opts.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) out.push("Don't use your email address in your password");
  if ((opts.names ?? []).some((n) => n.length >= 4 && lower === n.toLowerCase())) out.push("Don't use your name as your password");
  return out;
}

// ------------------------------------------------------------------ sign-up details (D-101)

const NamePart = z.string().trim().min(1, 'Required').max(60).regex(/^[\p{L}][\p{L}'’ -]*$/u, 'Use letters only').transform(tidyName);

export const PersonDetails = z.object({
  surname: NamePart,
  firstName: NamePart,
  middleName: z.union([NamePart, z.literal('').transform(() => undefined)]).optional(),
  gender: z.enum(['male', 'female']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker').refine(realDate, 'Not a real date')
    .refine((d) => d >= '1900-01-01' && d <= new Date().toISOString().slice(0, 10), 'Check the date of birth')
    .refine((d) => ageOn(d) >= MINIMUM_AGE, `You must be ${MINIMUM_AGE} or older to use SAZO`),
});
export type PersonDetails = z.infer<typeof PersonDetails>;

export const Email = z.string().trim().max(254).email('Enter a valid email address').transform(tidyEmail);
