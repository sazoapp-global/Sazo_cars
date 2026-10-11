// The sign-up details (D-101): surname, first name, middle name (optional), gender, date of birth (18+).
// Used on sign-up, Google sign-up and "finish your details".

/** Latest date of birth allowed today (18 years ago). */
export function latestDob(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

export interface PersonValues { surname?: string; firstName?: string; middleName?: string; gender?: string; dateOfBirth?: string }

export function PersonFields({ values = {}, errors = {}, lockIdentity = false, idPrefix = '' }: { values?: PersonValues; errors?: Record<string, string>; lockIdentity?: boolean; idPrefix?: string }) {
  const id = (k: string) => `${idPrefix}${k}`;
  const err = (k: string) => errors[k] && <p id={id(`${k}-error`)} className="mt-1 text-sm font-semibold text-bad-text">{errors[k]}</p>;
  const described = (k: string) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': id(`${k}-error`) } : {});
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id('surname')} className="label">Surname</label>
          <input id={id('surname')} name="surname" autoComplete="family-name" required maxLength={60} defaultValue={values.surname} className="field" {...described('surname')} />
          {err('surname')}
        </div>
        <div>
          <label htmlFor={id('firstName')} className="label">First name</label>
          <input id={id('firstName')} name="firstName" autoComplete="given-name" required maxLength={60} defaultValue={values.firstName} className="field" {...described('firstName')} />
          {err('firstName')}
        </div>
      </div>
      <div>
        <label htmlFor={id('middleName')} className="label">Middle name <span className="font-normal text-muted">(optional)</span></label>
        <input id={id('middleName')} name="middleName" autoComplete="additional-name" maxLength={60} defaultValue={values.middleName} className="field" {...described('middleName')} />
        {err('middleName')}
      </div>
      {lockIdentity ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="label">Gender</legend>
            <div className="flex gap-2">
              {[['female', 'Female'], ['male', 'Male']].map(([v, l]) => (
                <label key={v} className="flex min-h-12 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 has-[:checked]:border-primary-container has-[:checked]:bg-soft">
                  <input type="radio" name="gender" value={v} required defaultChecked={values.gender === v} className="h-4 w-4 accent-[var(--color-primary-container)]" />{l}
                </label>
              ))}
            </div>
            {err('gender')}
          </fieldset>
          <div>
            <label htmlFor={id('dateOfBirth')} className="label">Date of birth</label>
            <input id={id('dateOfBirth')} name="dateOfBirth" type="date" required max={latestDob()} min="1900-01-01" defaultValue={values.dateOfBirth} className="field" {...described('dateOfBirth')} />
            {err('dateOfBirth')}
          </div>
        </div>
      )}
      {lockIdentity ? null : (
        <p className="text-sm text-muted">You must be 18 or older. SAZO uses your gender and date of birth to identify you — for example if a record you add is ever questioned — and keeps your date of birth encrypted.</p>
      )}
    </div>
  );
}

/** Read the fields back from a submitted form (empty middle name → left out). */
export function personFrom(form: FormData) {
  const v = (k: string) => String(form.get(k) ?? '').trim();
  return { surname: v('surname'), firstName: v('firstName'), ...(v('middleName') ? { middleName: v('middleName') } : {}), gender: v('gender'), dateOfBirth: v('dateOfBirth') };
}
