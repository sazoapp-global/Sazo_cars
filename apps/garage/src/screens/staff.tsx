import { useCallback, useEffect, useState } from 'react';
import type { Garage } from '../lib/types';
import { Icon } from '../components/icon';
import { ApiError, OfflineError, request } from '../lib/api';
import { go } from '../lib/route';
import type { StaffMember } from '../lib/types';

const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff' };

/** Managers add mechanics and receptionists (D-056). Everyone signs in with their own phone. */
export function Staff({ garage }: { garage: Garage }) {
  const [staff, setStaff] = useState<StaffMember[]>();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'org_staff' | 'org_manager'>('org_staff');
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();

  const load = useCallback(async () => {
    try { setStaff(await request<StaffMember[]>('/garage/staff', { org: garage.id })); } catch (err) {
      if (err instanceof OfflineError) setMsg({ ok: false, text: 'No signal — the staff list needs the internet.' }); else throw err;
    }
  }, [garage.id]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const d = phone.replace(/[\s\-().]/g, '');
    const e164 = d.startsWith('+') ? d : d.startsWith('0') ? `+256${d.slice(1)}` : d.startsWith('256') ? `+${d}` : `+256${d}`;
    try {
      await request('/garage/staff', { method: 'POST', org: garage.id, body: { phone: e164, displayName: name.trim(), role } });
      setMsg({ ok: true, text: `${name.trim()} was added and will get an SMS.` });
      setPhone(''); setName('');
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof OfflineError ? 'No signal. Try again when online.' : err instanceof ApiError && err.status === 400 ? 'Check the name and phone number.' : 'Could not add this person.' });
    }
  }

  return (
    <div className="space-y-4 p-4">
      <button type="button" className="flex items-center gap-1 font-semibold text-primary-container" onClick={() => go({ name: 'home' })}><Icon name="arrow_back" size={18} />Home</button>
      <h1 className="font-display text-2xl font-bold">Staff</h1>
      <ul className="card divide-y divide-line">
        {(staff ?? []).map((s) => (
          <li key={s.userId} className="flex items-center justify-between gap-3 p-3"><span className="font-semibold">{s.displayName}</span><span className="text-sm text-muted">{ROLE[s.role] ?? s.role}</span></li>
        ))}
        {!staff && <li className="p-3"><div className="skeleton h-6" /></li>}
      </ul>
      <form className="card space-y-3 p-4" onSubmit={(e) => void add(e)}>
        <h2 className="font-display text-lg font-bold">Add someone</h2>
        <div><label htmlFor="s-name" className="label">Name</label><input id="s-name" className="field" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="s-phone" className="label">Phone number</label><input id="s-phone" className="field" type="tel" inputMode="tel" required placeholder="0772 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <fieldset><legend className="label">Role</legend>
          <div className="flex gap-2">{(['org_staff', 'org_manager'] as const).map((r) => (
            <button key={r} type="button" className="pill flex-1 justify-center" aria-pressed={role === r} onClick={() => setRole(r)}>{r === 'org_staff' ? 'Staff (records jobs)' : 'Manager'}</button>
          ))}</div>
        </fieldset>
        {msg && <p role="status" className={`text-sm font-semibold ${msg.ok ? 'text-ok-text' : 'text-bad-text'}`}>{msg.text}</p>}
        <button type="submit" className="btn btn-primary w-full"><Icon name="person_add" />Add</button>
      </form>
    </div>
  );
}
