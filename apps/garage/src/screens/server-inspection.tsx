import { PANEL_LABELS, REPAINT_MICRONS, STRUCTURE_LABELS, formatKm, type Panel, type StructureArea } from '@sazo/contracts';
import { useEffect, useState } from 'react';
import { Chip, JOB_STATUS, PlateText, when } from '../components/bits';
import { Icon } from '../components/icon';
import { ApiError, OfflineError, request } from '../lib/api';
import { kv } from '../lib/db';
import { go } from '../lib/route';
import type { Garage, ServerInspection } from '../lib/types';
import { RESULT } from './inspection-home';

/** An inspection already sent (or started on another phone): read-only. */
export function ServerInspectionView({ id, workplace }: { id: string; workplace: Garage }) {
  const [i, setI] = useState<ServerInspection | null | undefined>();
  useEffect(() => {
    void (async () => {
      try { setI(await request<ServerInspection>(`/inspections/${id}`, { org: workplace.id })); } catch (err) {
        if (err instanceof OfflineError) setI((await kv.get<ServerInspection[]>(`inspections:${workplace.id}`))?.find((x) => x.inspectionId === id) ?? null);
        else if (err instanceof ApiError && err.status === 404) setI(null);
        else throw err;
      }
    })();
  }, [id, workplace.id]);

  if (i === undefined) return <div className="skeleton m-4 h-40" />;
  if (i === null) return <div className="p-4"><p>Inspection not found.</p><button type="button" className="btn btn-ghost mt-3" onClick={() => go({ name: 'home' })}>Back</button></div>;
  const f = i.form;
  const km = f.mileage ? (f.mileage.unit === 'mi' ? Math.round(f.mileage.value * 1.609344) : f.mileage.value) : undefined;
  const result = RESULT(f.result?.passed);
  const thick = (f.paint?.readings ?? []).filter((r) => r.microns > REPAINT_MICRONS);
  return (
    <div className="space-y-4 p-4">
      <button type="button" className="flex items-center gap-1 font-semibold text-primary-container" onClick={() => go({ name: 'home' })}><Icon name="arrow_back" size={18} />Inspections</button>
      <div className="flex items-center justify-between gap-2"><PlateText value={i.plateEntered} /><span className="sazo-id text-sm text-label">{i.publicRef}</span></div>
      <div className="flex flex-wrap gap-2"><Chip s={JOB_STATUS[i.status]!} />{result && <Chip s={result} />}</div>
      {i.status === 'draft' && <p className="text-sm text-muted">This inspection was started on another phone. Finish it there.</p>}
      {i.rejectionReason && <p className="rounded-lg border border-bad-line bg-bad-fill p-3 text-bad-text">{i.rejectionReason}</p>}
      <dl className="card divide-y divide-line">
        {[
          ['Date', when(i.clientCreatedAt)],
          ['Inspector', i.createdBy.displayName],
          ['Mileage', km !== undefined ? formatKm(km) : '—'],
          ['Structure', f.structure ? (f.structure.damageFound ? `Damage: ${f.structure.areas.map((a) => STRUCTURE_LABELS[a as StructureArea]).join(', ')}` : 'No damage found') : '—'],
          ['Paint', f.paint?.readings.length ? (thick.length ? `Thick on ${thick.map((r) => PANEL_LABELS[r.panel as Panel]).join(', ')}` : `${f.paint.readings.length} panels, all normal`) : 'Not measured'],
          ['Tyres', f.tyres ? `${f.tyres.minTreadPercent}% tread left (worst tyre)` : '—'],
          ['Battery', f.battery ? (f.battery.ok ? 'OK' : 'Needs attention') : '—'],
          ['Defects', f.defects?.length ? f.defects.map((d) => `${d.item}${d.severity === 'major' ? ' (major)' : ''}`).join(' · ') : 'None noted'],
          ...(i.acknowledgedWarnings.length ? [['Explained', i.acknowledgedWarnings.map((w) => w.explanation).join(' · ')]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 p-3"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs text-muted">Inspections are never edited after sending. To correct one, tell SAZO — a correction is added next to it.</p>
    </div>
  );
}
