import type { Metadata } from 'next';
import { RecordsList } from '@/components/report/records-list';
import { SignInPrompt } from '@/components/signed-out';
import { VehicleHeader } from '@/components/vehicle-header';
import { api } from '@/lib/api';
import type { LedgerItem, Summary } from '@/lib/types';
import { requireFull } from '../load';

export const metadata: Metadata = { title: 'Evidence', robots: { index: false } };

export default async function Evidence({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ class?: string }> }) {
  const { ref } = await params;
  const cls = (await searchParams).class ?? 'all';
  const summary = await api<Summary>(`/vehicles/${ref}/summary`).catch(() => undefined);
  const data = await requireFull<{ items: LedgerItem[] }>(ref, 'evidence');
  return (
    <>
      {summary && <VehicleHeader v={summary.vehicle} asOf={summary.asOf} tab="evidence" />}
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        {!data ? <SignInPrompt next={`/v/${ref}/evidence`} what="every record" /> : (
          <RecordsList all={data.items} cls={cls} hrefFor={(c) => (c === 'all' ? `/v/${ref}/evidence` : `/v/${ref}/evidence?class=${c}`)} />
        )}
      </div>
    </>
  );
}
