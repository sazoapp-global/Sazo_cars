import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import type { Submission } from '@/lib/types';
import { loadSource } from '../../load';

const LABEL: Record<string, string> = { accepted: 'Added', needs_review: 'SAZO will check', rejected: 'Not accepted', pending: 'Processing' };

export default async function SubmissionPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  await loadSource(code, `/partner/${code}/submissions/${id}`);
  const s = await api<Submission>(`/ingest/submissions/${id}`, { auth: true }).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <Link href={`/partner/${code}?tab=recent`} className="link text-sm">← Sent recently</Link>
      <h1 className="mt-2 font-display text-2xl font-bold">Submission</h1>
      <p className="sazo-id text-sm text-muted">{s.submissionId}</p>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-wider text-label"><tr><th className="p-3">#</th><th className="p-3">Result</th><th className="p-3">Vehicle</th><th className="p-3">Why</th></tr></thead>
          <tbody className="divide-y divide-line">
            {s.items.map((i) => (
              <tr key={i.sequence}><td className="p-3 tabular-nums">{i.sequence}</td><td className="p-3 font-semibold">{LABEL[i.status] ?? i.status}</td>
                <td className="p-3">{i.vehicleRef ? <Link className="link sazo-id" href={`/v/${i.vehicleRef}`}>{i.vehicleRef}</Link> : '—'}</td>
                <td className="p-3">{i.errors.map((e) => e.message).join('; ') || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
