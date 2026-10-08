'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { uploadCsv, type UploadState } from '../actions';

const LABEL: Record<string, string> = { accepted: 'Added', needs_review: 'SAZO will check', rejected: 'Not accepted', invalid: 'Not sent' };
const CLS: Record<string, string> = { accepted: 'text-ok-text', needs_review: 'text-warn-text', rejected: 'text-bad-text', invalid: 'text-bad-text' };

export function UploadForm({ source, domain }: { source: string; domain: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadCsv, {});
  const counts = (state.rows ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  const problems = (state.rows ?? []).filter((r) => r.status !== 'accepted');
  return (
    <div className="space-y-4">
      <form action={action} className="card space-y-3 p-4">
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="domain" value={domain} />
        <p className="text-sm text-muted">One row per record. Columns: <code className="font-mono text-[0.9em]">vin, chassis_number, plate</code> (at least one), <code className="font-mono text-[0.9em]">record_type</code>, <code className="font-mono text-[0.9em]">date</code> (YYYY-MM-DD), then the details. Lists use <strong>;</strong> between items. Up to 5,000 rows. Sending the same file twice does not create duplicates.</p>
        <a className="link text-sm" href={`/partner/${source}/template.csv`} download>Download the template for this source</a>
        <div><label htmlFor="file" className="label">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Checking and sending…' : 'Upload'}</button>
      </form>
      {state.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{state.error}</p>}
      {state.rows && (
        <section role="status" aria-label="Upload result" className="card p-4">
          <h3 className="font-semibold">{state.fileName}: {state.total} rows</h3>
          <p className="mt-1 text-sm">{Object.entries(counts).map(([k, n]) => `${n} ${LABEL[k]?.toLowerCase()}`).join(' · ')}</p>
          {(state.submissionIds ?? []).length > 0 && (
            <p className="mt-1 text-sm">Received as {(state.submissionIds ?? []).map((id, i) => <Link key={id} className="link mr-2" href={`/partner/${source}/submissions/${id}`}>submission {i + 1}</Link>)}</p>
          )}
          {problems.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-label"><tr><th className="py-1 pr-3">Row</th><th className="py-1 pr-3">Result</th><th className="py-1">Why</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {problems.slice(0, 200).map((r) => (
                    <tr key={r.row}><td className="py-1.5 pr-3 tabular-nums">{r.row}</td><td className={`py-1.5 pr-3 font-semibold ${CLS[r.status]}`}>{LABEL[r.status]}</td>
                      <td className="py-1.5 break-words">{r.message ?? (r.vehicleRef ? <Link className="link" href={`/v/${r.vehicleRef}`}>{r.vehicleRef}</Link> : '')}</td></tr>
                  ))}
                </tbody>
              </table>
              {problems.length > 200 && <p className="mt-2 text-sm text-muted">Showing the first 200 rows that need attention.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
