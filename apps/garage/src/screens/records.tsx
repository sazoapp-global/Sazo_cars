// All job records (Partners design P1 table): search by plate or job number, filter by status and staff.
import { useState } from 'react';
import { STATUS_FILTERS, rowStatus } from '../components/bits';
import { Icon } from '../components/icon';
import type { Garage } from '../lib/types';
import type { JobsState } from '../lib/use-jobs';
import { JobList, newJob } from './home';

export function Records({ garage, jobs }: { garage: Garage; jobs: JobsState }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [staff, setStaff] = useState('all');
  const localIds = new Set(jobs.drafts.map((d) => d.jobId));
  const server = (jobs.jobs ?? []).filter((j) => !localIds.has(j.jobId));
  const people = [...new Map(server.map((j) => [j.createdBy.userId, j.createdBy.displayName])).entries()];
  const term = q.replace(/\s/g, '').toUpperCase();
  const match = (plate: string, ref = '') => !term || plate.replace(/\s/g, '').toUpperCase().includes(term) || ref.toUpperCase().includes(term);
  const drafts = jobs.drafts.filter((d) => (status === 'all' || status === 'draft') && staff === 'all' && match(d.plateEntered));
  const shown = server.filter((j) => (status === 'all' || rowStatus(j).key === status) && (staff === 'all' || j.createdBy.userId === staff) && match(j.plateEntered, j.publicRef));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Job records</h1>
          <p className="text-muted">{jobs.jobs === undefined ? 'Loading…' : `${server.length + jobs.drafts.length} jobs${jobs.stale ? ' · last seen online' : ''}`}</p>
        </div>
        <button type="button" className="btn btn-focal w-full shadow-sm sm:w-auto" onClick={() => void newJob(garage)}><Icon name="add" size={22} />New job</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" role="search" aria-label="Find jobs">
        <div className="relative">
          <label htmlFor="rq" className="sr-only">Plate or job number</label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label" />
          <input id="rq" className="field !pl-10" placeholder="Plate or job number" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        </div>
        <div><label htmlFor="rs" className="sr-only">Status</label>
          <select id="rs" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_FILTERS.map(([v, t]) => <option key={v} value={v}>{v === 'all' ? 'Status: all' : t}</option>)}</select></div>
        <div><label htmlFor="rp" className="sr-only">Staff</label>
          <select id="rp" className="field" value={staff} onChange={(e) => setStaff(e.target.value)}><option value="all">Staff: everyone</option>{people.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
      </div>
      {jobs.jobs === undefined ? <div className="skeleton h-40" /> : drafts.length + shown.length === 0 ? (
        <p className="card p-4 text-muted">{q || status !== 'all' || staff !== 'all' ? 'No jobs match. Try another plate or filter.' : 'No jobs yet.'}</p>
      ) : <JobList drafts={drafts} jobs={shown} />}
      <p className="text-xs text-muted">Shows your garage’s latest 100 jobs. Costs and customer details are never shown to buyers.</p>
    </div>
  );
}
