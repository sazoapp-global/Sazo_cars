import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import { NegotiateCard, QuestionNav, ReportHero, ReportSections } from '@/components/report/report-view';
import { PrintButton } from '@/components/share-buttons';
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
  return (
    <>
      <div className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8 lg:px-12">
          <p className="text-sm text-muted">Shared report <span className="sazo-id">{s.snapshotRef}</span> · a copy frozen on {formatDate(s.createdAt)}. Records may have changed since.</p>
          <PrintButton />
        </div>
      </div>
      <ReportHero r={s.report} x={{}} />
      <QuestionNav questions={s.report.questions} />
      <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-8 md:py-10 lg:px-12">
        <ReportSections r={s.report} x={{}} />
        <NegotiateCard />
        <p className="text-xs text-muted">SAZO describes what the available records showed on {formatDate(s.createdAt)}. It does not certify a vehicle.</p>
      </div>
    </>
  );
}
