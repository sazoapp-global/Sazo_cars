import { formatKm } from '@sazo/contracts';
import { useEffect, useState } from 'react';
import type { Garage } from '../lib/types';
import { Chip, JOB_STATUS, OWNER, PlateText, when, works } from '../components/bits';
import { Icon } from '../components/icon';
import { ApiError, OfflineError, request } from '../lib/api';
import { kv } from '../lib/db';
import { go } from '../lib/route';
import type { ServerJob } from '../lib/types';

/** A job already sent (or saved from another phone): who recorded it, when, and what the customer said. */
export function ServerJobView({ jobId, garage }: { jobId: string; garage: Garage }) {
  const [job, setJob] = useState<ServerJob | null | undefined>();
  useEffect(() => {
    void (async () => {
      try { setJob(await request<ServerJob>(`/garage/jobs/${jobId}`, { org: garage.id })); } catch (err) {
        if (err instanceof OfflineError) setJob((await kv.get<ServerJob[]>(`jobs:${garage.id}`))?.find((j) => j.jobId === jobId) ?? null);
        else if (err instanceof ApiError && err.status === 404) setJob(null);
        else throw err;
      }
    })();
  }, [jobId, garage.id]);

  if (job === undefined) return <div className="skeleton m-4 h-40" />;
  if (job === null) return <div className="p-4"><p>Job not found.</p><button type="button" className="btn btn-ghost mt-3" onClick={() => go({ name: 'home' })}>Back</button></div>;
  const km = job.form.mileage ? (job.form.mileage.unit === 'mi' ? Math.round(job.form.mileage.value * 1.609344) : job.form.mileage.value) : undefined;
  return (
    <div className="space-y-4 p-4">
      <button type="button" className="flex items-center gap-1 font-semibold text-primary-container" onClick={() => go({ name: 'home' })}><Icon name="arrow_back" size={18} />Jobs</button>
      <div className="flex items-center justify-between gap-2"><PlateText value={job.plateEntered} /><span className="sazo-id text-sm text-label">{job.publicRef}</span></div>
      <div className="flex flex-wrap gap-2"><Chip s={JOB_STATUS[job.status]!} />{job.status !== 'draft' && <Chip s={OWNER[job.ownerConfirmation]!} />}</div>
      {job.status === 'draft' && <p className="text-sm text-muted">This draft was started on another phone. Finish it there.</p>}
      {job.rejectionReason && <p className="rounded-lg border border-bad-line bg-bad-fill p-3 text-bad-text">{job.rejectionReason}</p>}
      <dl className="card divide-y divide-line">
        {[
          ['Work', works(job.workTypes)],
          ['Mileage', km !== undefined ? formatKm(km) : '—'],
          ['Date', when(job.clientCreatedAt)],
          ['Recorded by', job.createdBy.displayName],
          ['Customer', job.form.customer?.name ? `${job.form.customer.name}${job.form.customer.phoneMasked ? ` · ${job.form.customer.phoneMasked}` : ''}` : 'Not given'],
          ...(job.acknowledgedWarnings.length ? [['Explained', job.acknowledgedWarnings.map((w) => w.explanation).join(' · ')]] : []),
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 p-3"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs text-muted">Records are never edited after sending. To correct one, tell SAZO — a correction is added next to it.</p>
    </div>
  );
}
