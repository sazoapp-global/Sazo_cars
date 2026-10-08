// Home for inspectors and inspection centres (P-004): start an inspection, finish ones on this phone, see what was sent.
import { useCallback, useEffect, useState } from 'react';
import { Chip, JOB_STATUS, PlateText, when } from '../components/bits';
import { Icon } from '../components/icon';
import { OfflineError, request } from '../lib/api';
import { inspectionsFor, kv, saveInspection, type LocalInspection } from '../lib/db';
import { go, useOnline } from '../lib/route';
import { syncAll } from '../lib/sync';
import type { Garage, Me, ServerInspection } from '../lib/types';
import { uuidv7 } from '../lib/uuid';

export const RESULT = (passed: boolean | undefined) => (passed === undefined ? undefined : passed
  ? { text: 'Passed', cls: 'text-ok-text bg-ok-fill border-ok-line', icon: 'check_circle' as const }
  : { text: 'Did not pass', cls: 'text-bad-text bg-bad-fill border-bad-line', icon: 'report' as const });

export function InspectionHome({ workplace, me, onSignOut }: { workplace: Garage; me: Me; onSignOut: () => void }) {
  const online = useOnline();
  const [local, setLocal] = useState<LocalInspection[]>([]);
  const [sent, setSent] = useState<ServerInspection[] | undefined>();
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    setLocal(await inspectionsFor(workplace.id));
    try {
      const res = await request<{ items: ServerInspection[] }>('/inspections?limit=30', { org: workplace.id });
      setSent(res.items);
      setStale(false);
      await kv.set(`inspections:${workplace.id}`, res.items);
    } catch (err) {
      if (!(err instanceof OfflineError)) throw err;
      setSent((await kv.get<ServerInspection[]>(`inspections:${workplace.id}`)) ?? []);
      setStale(true);
    }
  }, [workplace.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (online) void syncAll(workplace.id).then(refresh); }, [online, workplace.id, refresh]);

  async function start() {
    const id = uuidv7();
    await saveInspection({ id, orgId: workplace.id, plateEntered: '', form: {}, photos: {}, clientCreatedAt: new Date().toISOString(), dirty: false, updatedAt: '', step: 0 });
    go({ name: 'inspection', id });
  }

  const localIds = new Set(local.map((i) => i.id));
  const others = (sent ?? []).filter((i) => !localIds.has(i.inspectionId));

  return (
    <div className="space-y-6 p-4 pb-10">
      <button type="button" className="btn btn-focal w-full !min-h-16 text-lg" onClick={() => void start()}><Icon name="add" size={24} />New inspection</button>

      {local.length > 0 && (
        <section aria-labelledby="on-phone">
          <h2 id="on-phone" className="font-display text-lg font-bold">On this phone</h2>
          <ul className="mt-2 space-y-2">
            {local.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => go({ name: 'inspection', id: i.id })} className="card flex w-full items-center justify-between gap-3 p-4 text-left">
                  <div className="min-w-0">
                    {i.plateEntered ? <PlateText value={i.plateEntered} /> : <span className="font-semibold">New inspection — car not chosen yet</span>}
                    <p className="mt-1 truncate text-sm text-muted">{i.vehicleLabel ?? (i.newToSazo ? 'New to SAZO' : '')}</p>
                    <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${i.lastSyncError ? 'text-bad-text' : i.dirty ? 'text-warn-text' : 'text-ok-text'}`}>
                      <Icon name={i.lastSyncError ? 'report' : i.dirty ? 'cloud_upload' : 'cloud_done'} size={14} />
                      {i.lastSyncError ? `Not synced: ${i.lastSyncError}` : i.dirty ? 'Saved on phone · will upload when online' : 'Saved to SAZO'}
                    </p>
                  </div>
                  <Icon name="chevron_forward" className="shrink-0 text-label" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent">
        <div className="flex items-baseline justify-between">
          <h2 id="recent" className="font-display text-lg font-bold">Recent inspections</h2>
          {stale && <span className="text-xs text-muted">Last seen online</span>}
        </div>
        {sent === undefined ? <div className="skeleton mt-2 h-20" /> : others.length === 0 ? (
          <p className="mt-2 text-muted">No inspections yet. Tap <strong>New inspection</strong> when you start on a car.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {others.map((i) => {
              const result = RESULT(i.form.result?.passed);
              return (
                <li key={i.inspectionId}>
                  <button type="button" onClick={() => go({ name: 'server-inspection', id: i.inspectionId })} className="card w-full p-4 text-left">
                    <div className="flex items-center justify-between gap-2"><PlateText value={i.plateEntered} /><span className="sazo-id text-xs text-label">{i.publicRef}</span></div>
                    <p className="mt-1 text-sm">{when(i.clientCreatedAt)} · by {i.createdBy.displayName}</p>
                    <div className="mt-2 flex flex-wrap gap-2"><Chip s={JOB_STATUS[i.status]!} />{result && i.status !== 'draft' && <Chip s={result} />}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {workplace.role === 'org_manager' && <button type="button" className="btn btn-ghost" onClick={() => go({ name: 'staff' })}><Icon name="group" />Staff</button>}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}><Icon name="logout" />Sign out ({me.displayName})</button>
      </div>
    </div>
  );
}
