import { describe, expect, it } from 'vitest';
import { PersonDetails, ageOn, passwordProblems, personDisplayName, personInitials, tidyBusinessName, tidyName, tidySentence } from './people.js';

describe('tidying what people type (D-103)', () => {
  it('names: capitalised, hyphens and apostrophes kept', () => {
    expect(tidyName('  mIKE   anguzu ')).toBe('Mike Anguzu');
    expect(tidyName("o'neil-NAKATO")).toBe("O'Neil-Nakato");
  });
  it('business names keep words typed in capitals', () => {
    expect(tidyBusinessName('MTN motors ltd')).toBe('MTN Motors Ltd');
    expect(tidyBusinessName('nakawa AUTO repairs')).toBe('Nakawa AUTO Repairs');
    expect(tidyBusinessName('kansanga motors')).toBe('Kansanga Motors');
  });
  it('sentences: capital first letters, extra spaces gone, nothing lower-cased', () => {
    expect(tidySentence('full service.  oil changed!  replaced MTN tracker')).toBe('Full service. Oil changed! Replaced MTN tracker');
    expect(tidySentence('line one\nline two')).toBe('Line one\nLine two');
  });
});

describe('names shown (D-103)', () => {
  it('surname, middle initial, first name; circle from surname and first name', () => {
    expect(personDisplayName({ surname: 'Anguzu', firstName: 'Mike' })).toBe('Anguzu Mike');
    expect(personDisplayName({ surname: 'Anguzu', firstName: 'Mike', middleName: 'James' })).toBe('Anguzu J. Mike');
    expect(personInitials({ surname: 'Anguzu', firstName: 'Mike', middleName: 'James' })).toBe('AM');
    expect(personInitials({ displayName: 'Musa' })).toBe('M');
  });
});

describe('sign-up details (D-101)', () => {
  const base = { surname: 'anguzu', firstName: 'MIKE', gender: 'male', dateOfBirth: '1990-05-17' };
  it('tidies names and accepts adults', () => {
    expect(PersonDetails.parse({ ...base, middleName: '' })).toEqual({ surname: 'Anguzu', firstName: 'Mike', gender: 'male', dateOfBirth: '1990-05-17' });
  });
  it('refuses under-18s, impossible dates and odd genders', () => {
    const today = new Date();
    const seventeen = `${today.getUTCFullYear() - 17}-01-01`;
    expect(PersonDetails.safeParse({ ...base, dateOfBirth: seventeen }).success).toBe(false);
    expect(PersonDetails.safeParse({ ...base, dateOfBirth: '1990-02-30' }).success).toBe(false);
    expect(PersonDetails.safeParse({ ...base, gender: 'other' }).success).toBe(false);
    expect(PersonDetails.safeParse({ ...base, firstName: '123' }).success).toBe(false);
  });
  it('counts age by birthday', () => {
    expect(ageOn('2008-10-12', new Date('2026-10-11T12:00:00Z'))).toBe(17);
    expect(ageOn('2008-10-11', new Date('2026-10-11T12:00:00Z'))).toBe(18);
  });
});

describe('passwords (D-105)', () => {
  it('8+ for everyone, 12+ for sensitive roles, common ones refused', () => {
    expect(passwordProblems('river-stone-7', { sensitive: false })).toEqual([]);
    expect(passwordProblems('short', { sensitive: false })).toContain('Use at least 8 characters');
    expect(passwordProblems('river-stone', { sensitive: true })).toContain('Use at least 12 characters');
    expect(passwordProblems('password123', { sensitive: false })).toContain('This password is too common. Choose another');
    expect(passwordProblems('mike.anguzu99', { sensitive: false, email: 'mike.anguzu@example.com' })).toHaveLength(1);
  });
});
