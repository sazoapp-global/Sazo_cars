import { DOMAIN_RECORD_TYPES, RECORD_LABELS, fieldsFor, formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { PartnerRecord, SearchResult, SubmissionSummary } from '@/lib/types';
import { DOMAIN_NAMES } from '@/lib/partner';
import { VehicleResult } from '@/components/vehicle-card';
import { EntryForm, type Correction } from './entry-form';
import { loadSource } from './load';
import { UploadForm } from './upload-form';
import { WithdrawForm } from './withdraw-form';

/** Attributes as form values: dotted paths, lists joined with "; ", yes or no. */
function formValues(attrs: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(attrs)) {
    const path = `${prefix}${k}`;
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) out[path] = val.join('; ');
    else if (typeof val === 'object') Object.assign(out, formValues(val as Record<string, unknown>, `${path}.`));
    else if (typeof val === 'boolean') out[path] = val ? 'yes' : 'no';
    else out[path] = String(val);
  }
  return out;
}

const STATE: Record<PartnerRecord['state'], { text: string; cls: string }> = {
  active: { text: 'Counts', cls: 'bg-ok-fill text-ok-text' },
  corrected: { text: 'Corrected', cls: 'bg-warn-fill text-warn-text' },
  withdrawn: { text: 'Withdrawn', cls: 'bg-bad-fill text-bad-text' },
};

export const metadata: Metadata = { title: 'Send records', robots: { index: false } };

export default async function SourcePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ tab?: string; correct?: string; withdraw?: string; q?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? 'one';
  const source = await loadSource(code, `/partner/${code}`);
  const types = DOMAIN_RECORD_TYPES[source.domain] ?? [];
  const fields = Object.fromEntries(types.map((t) => [t, fieldsFor(t)]));
  const recent = tab === 'recent' ? (await api<{ items: SubmissionSummary[] }>(`/ingest/sources/${code}/submissions`, { auth: true })).items : [];
  const records = tab === 'records' ? (await api<{ items: PartnerRecord[] }>(`/ingest/sources/${code}/records`, { auth: true })).items : [];
  const correcting = sp.correct ? records.find((r) => r.id === sp.correct && r.state === 'active') : undefined;
  const withdrawing = sp.withdraw ? records.find((r) => r.id === sp.withdraw && r.state === 'active') : undefined;
  const correction: Correction | undefined = correcting && {
    observationId: correcting.id, type: correcting.type, identifiers: correcting.identifiers,
    values: { ...formValues(correcting.attributes), record_type: correcting.type, date: correcting.eventTime?.slice(0, 10) ?? '' },
  };
  const q = (sp.q ?? '').trim();
  const lookup = tab === 'lookup' && q.length >= 4 ? await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(q)}`) : undefined;
  const tabs = [['one', 'One record'], ['file', 'Upload a file'], ['recent', 'Sent recently'], ['records', 'Correct or withdraw'], ['lookup', 'Look up a car']] as const;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <Link href="/partner" className="link text-sm">← All sources</Link>
      <h1 className="mt-2 font-display text-2xl font-bold">{source.name}</h1>
      <p className="text-muted">{DOMAIN_NAMES[source.domain] ?? source.domain} · <span className="sazo-id">{source.code}</span>{source.isSimulated ? ' · simulated test data' : ''}</p>
      <nav aria-label="How to send" className="mt-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([id, label]) => (
          <Link key={id} href={`/partner/${code}?tab=${id}`} aria-current={tab === id ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === id ? 'border-primary-container text-primary-container' : 'border-transparent text-muted'}`}>{label}</Link>
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
        {tab === 'records' && correction && (
          <EntryForm source={code} domain={source.domain} types={[correction.type]} fields={fields} idempotencyKey={crypto.randomUUID()} correction={correction} />
        )}
        {tab === 'records' && withdrawing && !correction && <WithdrawForm source={code} observationId={withdrawing.id} />}
        {tab === 'records' && !correction && !withdrawing && (
          <section aria-labelledby="sent">
            <h2 id="sent" className="sr-only">Records sent</h2>
            <p className="text-sm text-muted">A record already sent is never edited. To fix one, send a correction: the new record replaces it and the old one stays in the history, marked corrected. To take one back, withdraw it with a reason.</p>
            {records.length === 0 ? <p className="mt-3 text-muted">Nothing sent yet.</p> : (
              <ul className="card mt-3 divide-y divide-line">
                {records.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{RECORD_LABELS[r.type] ?? r.type} <span className={`ml-1 rounded px-1.5 py-0.5 text-xs font-semibold ${STATE[r.state].cls}`}>{STATE[r.state].text}</span>{r.corrects ? <span className="ml-1 text-xs text-muted">a correction</span> : null}</p>
                      <p className="text-sm text-muted">{formatDate(r.eventTime, r.precision)} · sent {formatDate(r.recordedAt)}{r.vehicleRef ? <> · <Link className="link sazo-id" href={`/v/${r.vehicleRef}`}>{r.identifiers.plate ?? r.vehicleRef}</Link></> : null}</p>
                      {r.withdrawReason && <p className="text-sm">Reason: {r.withdrawReason}</p>}
                    </div>
                    {r.state === 'active' && (
                      <span className="flex gap-2 text-sm">
                        <Link className="btn btn-ghost" href={`/partner/${code}?tab=records&correct=${r.id}`}>Correct</Link>
                        <Link className="btn btn-ghost" href={`/partner/${code}?tab=records&withdraw=${r.id}`}>Withdraw</Link>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tab === 'lookup' && (
          <section aria-labelledby="lookup">
            <h2 id="lookup" className="sr-only">Look up a car</h2>
            <p className="text-sm text-muted">Check a car before you act on it, for example before lending against it. The report shows police and loan records as a status only.</p>
            <form method="get" className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="tab" value="lookup" />
              <label htmlFor="q" className="sr-only">Plate, VIN or chassis number</label>
              <input id="q" name="q" defaultValue={q} minLength={4} maxLength={32} required placeholder="Plate, VIN or chassis number" className="field sazo-id max-w-sm flex-1" autoComplete="off" />
              <button className="btn btn-primary">Look up</button>
            </form>
            {lookup && (lookup.outcome === 'found' || lookup.outcome === 'multiple') && (
              <div className="mt-4 space-y-3">
                {lookup.outcome === 'multiple' && <p role="status" className="rounded-lg border border-warn-line bg-warn-fill p-3 text-sm font-semibold text-warn-text">{lookup.matches.length} cars match. One of them may be using a copied plate: check the chassis number on the car itself.</p>}
                {lookup.matches.map((m) => <VehicleResult key={m.vehicleRef} v={m} />)}
              </div>
            )}
            {lookup?.outcome === 'not_found' && <p role="status" className="mt-4 text-muted">SAZO has no records for <span className="sazo-id font-semibold">{lookup.normalizedQuery}</span> yet. That does not mean anything is wrong.</p>}
            {lookup?.outcome === 'invalid' && <p role="alert" className="mt-4 text-bad-text">That does not look like a plate, VIN or chassis number.</p>}
          </section>
        )}
      </div>
    </div>
  );
}
