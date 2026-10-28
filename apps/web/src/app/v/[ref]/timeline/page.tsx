import type { Metadata } from 'next';
import { TimelineList } from '@/components/report/timeline-list';
import { SignInPrompt } from '@/components/signed-out';
import { VehicleHeader } from '@/components/vehicle-header';
import type { Summary, TimelineItem } from '@/lib/types';
import { api } from '@/lib/api';
import { requireFull } from '../load';

export const metadata: Metadata = { title: 'Timeline', robots: { index: false } };

export default async function Timeline({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const summary = await api<Summary>(`/vehicles/${ref}/summary`).catch(() => undefined);
  const data = await requireFull<{ items: TimelineItem[] }>(ref, 'timeline');
  return (
    <>
      {summary && <VehicleHeader v={summary.vehicle} asOf={summary.asOf} tab="timeline" />}
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        {!data ? <SignInPrompt next={`/v/${ref}/timeline`} what="the timeline" /> : <TimelineList items={data.items} />}
      </div>
    </>
  );
}
