// Garage home (Partners design P1): greeting, the garage's numbers, recent jobs and what needs attention.
// Every figure is counted from SAZO's records for this garage; nothing is estimated.
import { formatKm } from '@sazo/contracts';
import { Chip, PlateText, firstName, kmOfJob, rowStatus, when, works } from '../components/bits';
import { Icon } from '../components/icon';
import { saveDraft, type LocalDraft } from '../lib/db';
import { go } from '../lib/route';
import type { Garage, Me, ServerJob } from '../lib/types';
import type { Alert, JobsState } from '../lib/use-jobs';
import { uuidv7 } from '../lib/uuid';

export async function newJob(garage: Garage) {
  const jobId = uuidv7();
  await saveDraft({ jobId, orgId: garage.id, plateEntered: '', workTypes: [], form: {}, photos: { extra: [] }, clientCreatedAt: new Date().toISOString(), dirty: false, updatedAt: '', step: 0 });
  go({ name: 'job', jobId });
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

export function Home({ garage, me, jobs }: { garage: Garage; me: Me; jobs: JobsState }) {
  const { drafts, jobs: list, summary, stale, alerts } = jobs;
  const localIds = new Set(drafts.map((d) => d.jobId));
  const server = (list ?? []).filter((j) => !localIds.has(j.jobId));
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{greeting()}, {firstName(me.displayName)}</h1>
          <p className="text-muted">{today()}{drafts.length ? ` · ${drafts.length} ${drafts.length === 1 ? 'job' : 'jobs'} on this phone` : ''}</p>
        </div>
        <button type="button" className="btn btn-focal w-full shadow-sm sm:w-auto" onClick={() => void newJob(garage)}><Icon name="add" size={22} />New job</button>
      </div>

      <Numbers jobs={jobs} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="recent" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="recent" className="font-display text-lg font-bold">Recent jobs</h2>
            <span className="text-sm">{stale && <span className="mr-3 text-muted">Last seen online</span>}<button type="button" className="link" onClick={() => go({ name: 'records' })}>All job records</button></span>
          </div>
          {list === undefined ? <div className="skeleton mt-3 h-40" /> : drafts.length + server.length === 0 ? (
            <p className="card mt-3 p-4 text-muted">No jobs yet. Tap <strong>New job</strong> when a car comes in.</p>
          ) : <JobList drafts={drafts} jobs={server} limit={8} />}
        </section>
        <AlertsPanel alerts={alerts} limit={4} />
      </div>
      {summary === undefined && list !== undefined && stale && <p className="text-sm text-muted">Numbers appear once the phone has been online.</p>}
    </div>
  );
}

function Numbers({ jobs }: { jobs: JobsState }) {
  const s = jobs.summary;
  const diff = s ? s.thisMonth - s.lastMonth : 0;
  const answered = s ? s.customers.confirmed + s.customers.disputed : 0;
  const cells: { label: string; value: string; sub: string; tone?: 'ok' | 'bad' }[] = [
    { label: 'Jobs sent this month', value: s ? String(s.thisMonth) : '...', sub: !s ? '' : diff === 0 ? 'Same as last month' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} vs last month`, tone: diff > 0 ? 'ok' : undefined },
    { label: 'Customers confirmed', value: s ? (answered ? `${Math.round((s.customers.confirmed / answered) * 100)}%` : 'None yet') : '...', sub: !s ? '' : s.customers.asked ? `${s.customers.waiting} waiting for an answer` : 'No customer SMS sent yet' },
    { label: 'Drafts', value: String(jobs.drafts.length + (jobs.jobs ?? []).filter((j) => j.status === 'draft' && !jobs.drafts.some((d) => d.jobId === j.jobId)).length), sub: jobs.unsent ? `${jobs.unsent} not sent to SAZO yet` : 'All saved to SAZO' },
    { label: 'Customer disputes', value: s ? String(s.customers.disputed) : '...', sub: s ? `${s.notAccepted} not accepted by SAZO` : '', tone: s && s.customers.disputed ? 'bad' : undefined },
  ];
  return (
    <dl className="grid grid-cols-2 border-y-2 border-t-ink border-b-line-strong bg-white md:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} className={`p-4 ${i % 2 === 0 ? 'border-r border-line' : 'md:border-r md:border-line'} ${i < 2 ? 'border-b border-line md:border-b-0' : ''} ${i === 3 ? 'md:!border-r-0' : ''}`}>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-label">{c.label}</dt>
          <dd className={`font-display text-3xl font-extrabold tabular-nums ${c.tone === 'bad' ? 'text-bad-text' : 'text-ink'}`}>{c.value}</dd>
          <dd className={`text-xs ${c.tone === 'ok' ? 'font-semibold text-ok-text' : 'text-muted'}`}>{c.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Jobs as a table on wide screens and as cards on phones. Drafts on this phone come first. */
export function JobList({ drafts, jobs, limit }: { drafts: LocalDraft[]; jobs: ServerJob[]; limit?: number }) {
  type Row = { id: string; plate: string; work: string; km?: number; by?: string; date: string; status: ReturnType<typeof rowStatus>; open: () => void; sync?: string; synced?: boolean; ref?: string };
  const rows: Row[] = [
    ...drafts.map((d) => ({
      id: d.jobId, plate: d.plateEntered, work: d.workTypes.length ? works(d.workTypes) : 'Work not chosen yet', km: kmOfJob(d.form.mileage), date: d.clientCreatedAt,
      status: { ...rowStatus({ status: 'draft' }), text: d.lastSyncError ? 'Not sent' : d.dirty ? 'On this phone' : 'Draft' }, open: () => go({ name: 'job', jobId: d.jobId }),
      sync: d.lastSyncError ? `Not synced: ${d.lastSyncError}` : d.dirty ? 'Saved on phone · will upload when online' : 'Saved to SAZO', synced: !d.lastSyncError && !d.dirty,
    })),
    ...jobs.map((j) => ({
      id: j.jobId, plate: j.plateEntered, work: works(j.workTypes), km: kmOfJob(j.form.mileage), by: j.createdBy.displayName, date: j.clientCreatedAt, ref: j.publicRef,
      status: rowStatus(j), open: () => go({ name: 'server-job', jobId: j.jobId }),
    })),
  ].slice(0, limit);
  return (
    <>
      <div tabIndex={0} role="region" aria-label="Job records" className="mt-3 hidden overflow-x-auto rounded-[14px] border border-line bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-primary-container md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-soft text-[11px] font-bold uppercase tracking-wider text-label">
            <tr><th scope="col" className="px-4 py-3">Plate</th><th scope="col" className="px-3 py-3">Work</th><th scope="col" className="px-3 py-3 text-right">km</th><th scope="col" className="px-3 py-3">By</th><th scope="col" className="px-3 py-3">Date</th><th scope="col" className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-soft/60" onClick={r.open}>
                <th scope="row" className="whitespace-nowrap px-4 py-3"><button type="button" onClick={(e) => { e.stopPropagation(); r.open(); }} className="text-left">{r.plate ? <PlateText value={r.plate} /> : <span className="font-semibold">New job</span>}{r.ref && <span className="sazo-id mt-0.5 block text-[11px] font-normal text-label">{r.ref}</span>}</button></th>
                <td className="max-w-56 truncate px-3 py-3">{r.work}</td>
                <td className="px-3 py-3 text-right tabular-nums">{r.km !== undefined ? r.km.toLocaleString('en-UG') : 'Not recorded'}</td>
                <td className="px-3 py-3">{r.by ?? 'You'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{when(r.date)}</td>
                <td className="px-4 py-3"><Chip s={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={r.open} className="card w-full p-4 text-left">
              <div className="flex items-center justify-between gap-2">{r.plate ? <PlateText value={r.plate} /> : <span className="font-semibold">New job, car not chosen yet</span>}<Chip s={r.status} /></div>
              <p className="mt-1.5 text-sm">{r.work}{r.km !== undefined ? ` · ${formatKm(r.km)}` : ''}</p>
              <p className="mt-0.5 text-xs text-muted">{when(r.date)}{r.by ? ` · by ${r.by}` : ''}{r.ref ? ` · ${r.ref}` : ''}</p>
              {r.sync && <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${r.synced ? 'text-ok-text' : 'text-warn-text'}`}><Icon name={r.synced ? 'cloud_done' : 'cloud_upload'} size={14} />{r.sync}</p>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

const TONE: Record<Alert['tone'], string> = { bad: 'text-bad-text', warn: 'text-warn-text', ok: 'text-ok-text', info: 'text-primary-container' };

export function AlertsPanel({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const shown = limit ? alerts.slice(0, limit) : alerts;
  return (
    <section aria-labelledby="alerts-h" className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="alerts-h" className="font-display text-lg font-bold">{limit ? 'Needs your attention' : 'Alerts'}</h2>
        {limit && alerts.length > limit && <button type="button" className="link text-sm" onClick={() => go({ name: 'alerts' })}>All {alerts.length}</button>}
      </div>
      {shown.length === 0 ? <p className="card mt-3 p-4 text-muted">Nothing needs your attention.</p> : (
        <ul className="mt-3 divide-y divide-line rounded-[14px] border border-line bg-white shadow-sm">
          {shown.map((a) => (
            <li key={a.id} className="space-y-1 p-4">
              <p className={`text-[11px] font-extrabold uppercase tracking-wider ${TONE[a.tone]}`}>{a.kind}</p>
              <p className="text-sm">{a.text}</p>
              {a.action && <button type="button" className="link text-sm" onClick={() => go(a.action!.local ? { name: 'job', jobId: a.action!.jobId } : { name: 'server-job', jobId: a.action!.jobId })}>{a.action.label}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
