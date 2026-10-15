import { useState } from 'react';
import { ApiError, request } from '../lib/api';

/** Accounts made before 11 Oct 2026 give the details now required (D-101): names, gender, date of birth (18+). */
export function FinishDetails({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [v, setV] = useState({ surname: '', firstName: '', middleName: '', gender: '', dateOfBirth: '' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const max = new Date(Date.now() - 18 * 365.25 * 86400_000).toISOString().slice(0, 10);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(undefined);
    try {
      await request('/me/details', { method: 'PUT', body: { ...v, ...(v.middleName ? {} : { middleName: undefined }) } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Check your details.' : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md p-4 pt-8">
      <form className="card space-y-4 p-5" onSubmit={save} noValidate>
        <h1 className="font-display text-xl font-bold">Finish your details</h1>
        <p className="text-sm text-muted">SAZO now asks everyone for their full name, gender and date of birth. You only do this once.</p>
        <div><label htmlFor="fd-surname" className="label">Surname</label><input id="fd-surname" className="field" autoComplete="family-name" value={v.surname} onChange={set('surname')} /></div>
        <div><label htmlFor="fd-first" className="label">Given name</label><input id="fd-first" className="field" autoComplete="given-name" value={v.firstName} onChange={set('firstName')} /></div>
        <div><label htmlFor="fd-middle" className="label">Middle name (optional)</label><input id="fd-middle" className="field" autoComplete="additional-name" value={v.middleName} onChange={set('middleName')} /></div>
        <fieldset><legend className="label">Gender</legend>
          <div className="flex gap-2">{[['female', 'Female'], ['male', 'Male']].map(([val, l]) => (
            <label key={val} className="flex min-h-12 flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3"><input type="radio" name="gender" value={val} checked={v.gender === val} onChange={set('gender')} />{l}</label>
          ))}</div>
        </fieldset>
        <div><label htmlFor="fd-dob" className="label">Date of birth</label><input id="fd-dob" type="date" className="field" max={max} value={v.dateOfBirth} onChange={set('dateOfBirth')} /></div>
        <p className="text-sm text-muted">You must be 18 or older. Your gender and date of birth identify you on the jobs you record.</p>
        {error && <p role="alert" className="text-sm font-semibold text-bad-text">{error}</p>}
        <button className="btn btn-primary w-full" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        <button className="btn btn-ghost w-full" type="button" onClick={onSignOut}>Log out</button>
      </form>
    </div>
  );
}
