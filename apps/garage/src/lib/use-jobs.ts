// The garage's jobs, in one place for Home, Records and Alerts: drafts kept on this phone, the jobs SAZO
// has (cached for when there's no signal), and the garage's numbers from /garage/summary.
import { useCallback, useEffect, useState } from 'react';
import { OfflineError, request } from './api';
import { draftsFor, kv, type LocalDraft } from './db';
import { useOnline } from './route';
import { syncAll } from './sync';
import type { Garage, ServerJob } from './types';

export interface GarageSummary {
  thisMonth: number; lastMonth: number; drafts: number; checking: number; notAccepted: number;
  customers: { asked: number; confirmed: number; disputed: number; waiting: number };
}

export interface Alert { id: string; tone: 'bad' | 'warn' | 'ok' | 'info'; kind: string; text: string; action?: { label: string; jobId: string; local?: boolean } }

export interface JobsState {
  drafts: LocalDraft[];
  jobs: ServerJob[] | undefined;
  summary: GarageSummary | undefined;
  stale: boolean;
  alerts: Alert[];
  /** Alerts that need someone to act (shown as a count on the menu). */
  needsAction: number;
  /** Jobs saved on this phone that SAZO doesn't have yet. */
  unsent: number;
  refresh: () => Promise<void>;
}

const plate = (p: string) => p.toUpperCase() || 'A car';

function alertsFrom(drafts: LocalDraft[], jobs: ServerJob[]): Alert[] {
  const out: Alert[] = [];
  for (const d of drafts) if (d.lastSyncError) out.push({ id: `sync-${d.jobId}`, tone: 'warn', kind: 'Not sent', text: `${plate(d.plateEntered)} — ${d.lastSyncError}`, action: { label: 'Open', jobId: d.jobId, local: true } });
  for (const j of jobs) {
    if (j.ownerConfirmation === 'disputed') out.push({ id: `disp-${j.jobId}`, tone: 'bad', kind: 'Customer disputed', text: `The customer says the visit for ${plate(j.plateEntered)} (${j.publicRef}) is not right. SAZO may contact you — check your job card.`, action: { label: 'See the job', jobId: j.jobId } });
    if (j.status === 'rejected') out.push({ id: `rej-${j.jobId}`, tone: 'bad', kind: 'Not accepted', text: `${plate(j.plateEntered)} (${j.publicRef}): ${j.rejectionReason ?? 'SAZO could not accept this job.'}`, action: { label: 'See the job', jobId: j.jobId } });
  }
  for (const j of jobs) if (j.status === 'submitted') out.push({ id: `chk-${j.jobId}`, tone: 'info', kind: 'Being checked', text: `SAZO is matching ${plate(j.plateEntered)} to the right car.`, action: { label: 'See the job', jobId: j.jobId } });
  for (const j of jobs.filter((x) => x.ownerConfirmation === 'confirmed').slice(0, 5)) out.push({ id: `ok-${j.jobId}`, tone: 'ok', kind: 'Customer confirmed', text: `The customer confirmed the visit for ${plate(j.plateEntered)} (${j.publicRef}).` });
  return out;
}

export function useJobs(garage: Garage | undefined): JobsState {
  const online = useOnline();
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [jobs, setJobs] = useState<ServerJob[] | undefined>();
  const [summary, setSummary] = useState<GarageSummary>();
  const [stale, setStale] = useState(false);
  const id = garage && garage.type === 'garage' ? garage.id : undefined;

  const refresh = useCallback(async () => {
    if (!id) return;
    setDrafts(await draftsFor(id));
    try {
      const [res, sum] = await Promise.all([
        request<{ items: ServerJob[] }>('/garage/jobs?limit=100', { org: id }),
        request<GarageSummary>('/garage/summary', { org: id }),
      ]);
      setJobs(res.items); setSummary(sum); setStale(false);
      await kv.set(`jobs:${id}`, res.items);
      await kv.set(`summary:${id}`, sum);
    } catch (err) {
      if (!(err instanceof OfflineError)) throw err;
      setJobs((await kv.get<ServerJob[]>(`jobs:${id}`)) ?? []);
      setSummary(await kv.get<GarageSummary>(`summary:${id}`));
      setStale(true);
    }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (online && id) void syncAll(id).then(refresh); }, [online, id, refresh]);

  const alerts = alertsFrom(drafts, jobs ?? []);
  return {
    drafts, jobs, summary, stale, alerts, refresh,
    needsAction: alerts.filter((a) => a.tone === 'bad' || a.tone === 'warn').length,
    unsent: drafts.filter((d) => d.dirty).length,
  };
}
