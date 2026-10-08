import { DOMAIN_RECORD_TYPES, fieldsFor, formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { SubmissionSummary } from '@/lib/types';
import { DOMAIN_NAMES } from '@/lib/partner';
import { EntryForm } from './entry-form';
import { loadSource } from './load';
import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: 'Send records', robots: { index: false } };

export default async function SourcePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { code } = await params;
  const tab = (await searchParams).tab ?? 'one';
  const source = await loadSource(code, `/partner/${code}`);
  const types = DOMAIN_RECORD_TYPES[source.domain] ?? [];
  const fields = Object.fromEntries(types.map((t) => [t, fieldsFor(t)]));
  const recent = tab === 'recent' ? (await api<{ items: SubmissionSummary[] }>(`/ingest/sources/${code}/submissions`, { auth: true })).items : [];
  const tabs = [['one', 'One record'], ['file', 'Upload a file'], ['recent', 'Sent recently']] as const;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <Link href="/partner" className="link text-sm">← All sources</Link>
      <h1 className="mt-2 font-display text-2xl font-bold">{source.name}</h1>
      <p className="text-muted">{DOMAIN_NAMES[source.domain] ?? source.domain} · <span className="sazo-id">{source.code}</span>{source.isSimulated ? ' · simulated test data' : ''}</p>
      <nav aria-label="How to send" className="mt-4 flex gap-1 border-b border-line">
        {tabs.map(([id, label]) => (
          <Link key={id} href={`/partner/${code}?tab=${id}`} aria-current={tab === id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? 'border-primary-container text-primary-container' : 'border-transparent text-muted'}`}>{label}</Link>
        ))}
      </nav>
      <div className="mt-4">
        {tab === 'one' && <EntryForm source={code} domain={source.domain} types={types} fields={fields} idempotencyKey={crypto.randomUUID()} />}
        {tab === 'file' && <UploadForm source={code} domain={source.domain} />}
        {tab === 'recent' && (recent.length === 0 ? <p className="text-muted">Nothing sent yet.</p> : (
          <ul className="card divide-y divide-line">
            {recent.map((r) => (
              <li key={r.submissionId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>{formatDate(r.receivedAt)} · {r.items} {r.items === 1 ? 'record' : 'records'}</span>
                <span className="text-sm"><span className="text-ok-text">{r.accepted} added</span>{r.needsReview ? <span className="text-warn-text"> · {r.needsReview} to check</span> : null}{r.rejected ? <span className="text-bad-text"> · {r.rejected} not accepted</span> : null}
                  {' · '}<Link className="link" href={`/partner/${code}/submissions/${r.submissionId}`}>details</Link></span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
