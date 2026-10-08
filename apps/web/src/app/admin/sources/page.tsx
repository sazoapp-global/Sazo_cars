import type { Source } from '@/lib/types';
import { updateSource } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

const STATUS: Record<Source['status'], string> = { active: 'Active', paused: 'Paused', retired: 'Retired' };

export default async function Sources({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/sources');
  const sp = await searchParams;
  const data = await adminFetch<Source[]>('/admin/sources');
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Data sources</h1>
      <p className="mb-4 text-muted">Where records come from. While SAZO is in testing most are <strong>simulated</strong>. When a real partner connects, retire the simulated source and say which real one replaces it: its records stop counting but are kept (D-011).</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="managing data sources" /> : (
        <ul className="space-y-3">
          {data.map((s) => (
            <li key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold"><span className="sazo-id">{s.code}</span> · {s.name}</h2>
                <span className="flex flex-wrap gap-2">
                  <span className={`chip ${s.status === 'active' ? 'border-ok-line bg-ok-fill text-ok-text' : 'border-na-line bg-na-fill text-na-text'}`}>{STATUS[s.status]}</span>
                  {s.isSimulated && <span className="chip border-warn-line bg-warn-fill text-warn-text">Simulated</span>}
                </span>
              </div>
              <p className="text-sm text-muted">{s.domain} · {s.evidenceClass.replace('_', ' ')} · via {s.channel.replace('_', ' ')} · starting trust {s.baselineReputation.toFixed(2)}
                {s.supersededBySourceId ? ` · replaced by ${data.find((x) => x.id === s.supersededBySourceId)?.code ?? 'another source'}` : ''}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-semibold text-primary-container">Change</summary>
                <form action={updateSource} className="mt-2 grid gap-2 md:grid-cols-4 md:items-end">
                  <input type="hidden" name="id" value={s.id} />
                  <div><label htmlFor={`st-${s.id}`} className="label">Status</label>
                    <select id={`st-${s.id}`} name="status" defaultValue={s.status} className="field">{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label htmlFor={`sup-${s.id}`} className="label">Replaced by</label>
                    <select id={`sup-${s.id}`} name="supersededBySourceId" defaultValue={s.supersededBySourceId ?? ''} className="field">
                      <option value="">—</option>{data.filter((x) => x.id !== s.id && !x.isSimulated).map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
                    </select></div>
                  <div><label htmlFor={`why-${s.id}`} className="label">Reason</label><input id={`why-${s.id}`} name="reason" required minLength={3} className="field" /></div>
                  <button className="btn btn-primary">Save</button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
