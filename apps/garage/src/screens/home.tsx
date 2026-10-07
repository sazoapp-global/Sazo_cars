import { useCallback, useEffect, useState } from 'react';
import type { Garage } from '../lib/types';
import { Chip, JOB_STATUS, OWNER, PlateText, when, works } from '../components/bits';
import { Icon } from '../components/icon';
import { OfflineError, request } from '../lib/api';
import { draftsFor, kv, saveDraft, type LocalDraft } from '../lib/db';
import { go, useOnline } from '../lib/route';
import { syncAll } from '../lib/sync';
import type { Me, ServerJob } from '../lib/types';
import { uuidv7 } from '../lib/uuid';

export function Home({ garage, me, onSignOut }: { garage: Garage; me: Me; onSignOut: () => void }) {
  const online = useOnline();
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [jobs, setJobs] = useState<ServerJob[] | undefined>();
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    setDrafts(await draftsFor(garage.id));
    try {
      const res = await request<{ items: ServerJob[] }>('/garage/jobs?limit=30', { org: garage.id });
      setJobs(res.items);
      setStale(false);
      await kv.set(`jobs:${garage.id}`, res.items);
    } catch (err) {
      if (!(err instanceof OfflineError)) throw err;
      setJobs((await kv.get<ServerJob[]>(`jobs:${garage.id}`)) ?? []);
      setStale(true);
    }
  }, [garage.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (online) void syncAll(garage.id).then(refresh); }, [online, garage.id, refresh]);

  async function newJob() {
    const jobId = uuidv7();
    await saveDraft({ jobId, orgId: garage.id, plateEntered: '', workTypes: [], form: {}, photos: { extra: [] }, clientCreatedAt: new Date().toISOString(), dirty: false, updatedAt: '', step: 0 });
    go({ name: 'job', jobId });
  }

  const localIds = new Set(drafts.map((d) => d.jobId));
  const submitted = (jobs ?? []).filter((j) => j.status !== 'draft' && !localIds.has(j.jobId));
  const serverDrafts = (jobs ?? []).filter((j) => j.status === 'draft' && !localIds.has(j.jobId));

  return (
    <div className="space-y-6 p-4 pb-10">
      <button type="button" className="btn btn-focal w-full !min-h-16 text-lg" onClick={() => void newJob()}><Icon name="add" size={24} />New job</button>

      {drafts.length > 0 && (
        <section aria-labelledby="phone-drafts">
          <h2 id="phone-drafts" className="font-display text-lg font-bold">On this phone</h2>
          <ul className="mt-2 space-y-2">
            {drafts.map((d) => (
              <li key={d.jobId}>
                <button type="button" onClick={() => go({ name: 'job', jobId: d.jobId })} className="card flex w-full items-center justify-between gap-3 p-4 text-left">
                  <div className="min-w-0">
                    {d.plateEntered ? <PlateText value={d.plateEntered} /> : <span className="font-semibold">New job — car not chosen yet</span>}
                    <p className="mt-1 truncate text-sm text-muted">{d.workTypes.length ? works(d.workTypes) : 'No work chosen yet'}</p>
                    <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${d.lastSyncError ? 'text-bad-text' : d.dirty ? 'text-warn-text' : 'text-ok-text'}`}>
                      <Icon name={d.lastSyncError ? 'report' : d.dirty ? 'cloud_upload' : 'cloud_done'} size={14} />
                      {d.lastSyncError ? `Not synced: ${d.lastSyncError}` : d.dirty ? 'Saved on phone · will upload when online' : 'Saved to SAZO'}
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
          <h2 id="recent" className="font-display text-lg font-bold">Recent jobs</h2>
          {stale && <span className="text-xs text-muted">Last seen online</span>}
        </div>
        {jobs === undefined ? <div className="skeleton mt-2 h-20" /> : submitted.length + serverDrafts.length === 0 ? (
          <p className="mt-2 text-muted">No jobs yet. Tap <strong>New job</strong> when a car comes in.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {[...serverDrafts, ...submitted].map((j) => (
              <li key={j.jobId}>
                <button type="button" onClick={() => go({ name: 'server-job', jobId: j.jobId })} className="card w-full p-4 text-left">
                  <div className="flex items-center justify-between gap-2"><PlateText value={j.plateEntered} /><span className="sazo-id text-xs text-label">{j.publicRef}</span></div>
                  <p className="mt-1 text-sm">{works(j.workTypes)} · {when(j.clientCreatedAt)} · by {j.createdBy.displayName}</p>
                  <div className="mt-2 flex flex-wrap gap-2"><Chip s={JOB_STATUS[j.status]!} />{j.status !== 'draft' && <Chip s={OWNER[j.ownerConfirmation]!} />}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {garage.role === 'org_manager' && <button type="button" className="btn btn-ghost" onClick={() => go({ name: 'staff' })}><Icon name="group" />Staff</button>}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}><Icon name="logout" />Sign out ({me.displayName})</button>
      </div>
    </div>
  );
}
