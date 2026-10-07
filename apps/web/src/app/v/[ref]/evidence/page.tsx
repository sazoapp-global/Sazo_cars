import { RECORD_LABELS, formatDate, formatKm } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { SignInPrompt } from '@/components/signed-out';
import { VehicleHeader } from '@/components/vehicle-header';
import { api } from '@/lib/api';
import type { LedgerItem, Summary } from '@/lib/types';
import { requireFull } from '../load';

export const metadata: Metadata = { title: 'Evidence', robots: { index: false } };

const CLASSES: { id: string; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'official', label: 'Official' }, { id: 'garage', label: 'Garage' },
  { id: 'inspection', label: 'Inspection' }, { id: 'dealer', label: 'Dealer' }, { id: 'owner_provided', label: 'Owner-provided' },
];
const EXCLUDED: Record<string, string> = {
  corrected: 'Replaced by a correction — kept for the record, not counted',
  retracted: 'Withdrawn by its source — kept for the record, not counted',
  duplicate: 'Duplicate of another record — not counted twice',
  retired_simulated_source: 'From a test data source that has been replaced — not counted',
};

/** Attribute values in plain words; internal ids are never shown. */
function describe(item: LedgerItem): string {
  const a = item.attributes;
  if (item.type === 'odometer_reading') return formatKm(a.km) + (a.originalUnit === 'mi' ? ` (read as ${Number(a.originalValue).toLocaleString('en-UG')} miles)` : '');
  const parts: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (v === null || v === undefined || /Id$|PartyId$/.test(k)) continue;
    const label = k.replace(/([A-Z])/g, ' $1').toLowerCase();
    const value = Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? Object.values(v as object).join(' ') : String(v);
    parts.push(`${label}: ${value.replace(/_/g, ' ')}`);
  }
  return parts.join(' · ');
}

export default async function Evidence({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ class?: string }> }) {
  const { ref } = await params;
  const cls = (await searchParams).class ?? 'all';
  const summary = await api<Summary>(`/vehicles/${ref}/summary`).catch(() => undefined);
  const data = await requireFull<{ items: LedgerItem[] }>(ref, 'evidence');
  const items = data?.items.filter((i) => cls === 'all' || i.evidenceClass === cls) ?? [];
  return (
    <>
      {summary && <VehicleHeader v={summary.vehicle} asOf={summary.asOf} tab="evidence" />}
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        {!data ? <SignInPrompt next={`/v/${ref}/evidence`} what="every record" /> : (
          <>
            <p className="text-muted">Every record SAZO holds for this car, oldest first. Records are never deleted: corrections are added alongside them.</p>
            <nav aria-label="Filter by type of record" className="mt-4 flex flex-wrap gap-2">
              {CLASSES.map((c) => (
                <Link key={c.id} href={c.id === 'all' ? `/v/${ref}/evidence` : `/v/${ref}/evidence?class=${c.id}`} aria-current={cls === c.id ? 'true' : undefined}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${cls === c.id ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-white hover:border-primary-container'}`}>
                  {c.label}
                </Link>
              ))}
            </nav>
            {items.length === 0 ? <p className="mt-6 text-muted">No records of this type.</p> : (
              <ul className="mt-4 space-y-3">
                {items.map((i) => (
                  <li key={i.observationId} className={`card p-4 ${i.excluded ? 'opacity-75' : ''}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h2 className="font-semibold">{RECORD_LABELS[i.type] ?? i.type}</h2>
                      <time className="text-sm text-label" dateTime={i.time.at ?? undefined}>{formatDate(i.time.at, i.time.precision)}</time>
                    </div>
                    {describe(i) && <p className="mt-0.5 text-sm">{describe(i)}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="chip chip-class">{i.sourceLabel}</span>
                      {i.evidence.length > 0 && <span className="chip chip-class"><Icon name="photo_camera" size={14} />{i.evidence.map((e) => e.kind.replace(/_/g, ' ')).join(', ')}</span>}
                      {i.excluded && <span className="chip border-na-line bg-na-fill text-na-text">Not counted</span>}
                    </div>
                    {i.excluded && i.exclusionReason && <p className="mt-1 text-sm text-muted">{EXCLUDED[i.exclusionReason] ?? 'Not counted'}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
