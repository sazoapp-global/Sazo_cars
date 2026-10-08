import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import { FullReportView, NextSteps } from '@/components/full-report';
import { Plate } from '@/components/plate';
import { PrintButton } from '@/components/share-buttons';
import { vehicleName } from '@/components/vehicle-card';
import { ApiError, api } from '@/lib/api';
import type { SharedReport } from '@/lib/types';

export const metadata: Metadata = { title: 'Shared vehicle report', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** A frozen report opened from a share link — no sign-in. Prints cleanly as a PDF. */
export default async function Shared({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let s: SharedReport | undefined;
  let problem: 'expired' | 'invalid' | undefined;
  try {
    s = await api<SharedReport>(`/shared/${encodeURIComponent(token)}`);
  } catch (err) {
    problem = err instanceof ApiError && err.status === 410 ? 'expired' : 'invalid';
  }
  if (!s) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-display text-2xl font-bold">{problem === 'expired' ? 'This link has expired' : 'This link is not valid'}</h1>
        <p className="mt-1 text-muted">Ask the person who shared it for a new link, or search the car yourself on SAZO.</p>
      </div>
    );
  }
  const v = s.report.vehicle;
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {v.currentPlate && <Plate value={v.currentPlate} />}
          <h1 className="mt-2 font-display text-2xl font-bold md:text-3xl">{vehicleName(v)}</h1>
          <p className="text-sm text-muted">Report <span className="sazo-id">{s.snapshotRef}</span> · a copy frozen on {formatDate(s.createdAt)}. Records may have changed since.</p>
        </div>
        <PrintButton />
      </div>
      <FullReportView r={s.report} />
      <NextSteps />
      <p className="text-xs text-muted">SAZO describes what the available records showed on {formatDate(s.createdAt)}. It does not certify a vehicle.</p>
    </div>
  );
}
