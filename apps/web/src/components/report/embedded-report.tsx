// The full SAZO report inside a workspace with a side bar (option A, approved 28 Oct 2026): what buyers see on the
// car's public page down to the seven questions (the "Before you pay" card, owners' reviews and closing note are left
// off), in the space beside the side bar across its whole width. Its timeline and records open in the same place, and
// its buttons come back here. `base` is this workspace page's own address.
import Link from 'next/link';
import { headers } from 'next/headers';
import { saveCar, unsaveCar } from '@/app/buyer-actions';
import { claimCar } from '@/app/my-cars/actions';
import { loadVehicle } from '@/app/v/[ref]/load';
import { Icon } from '../icon';
import { PrintButton, ShareButtons } from '../share-buttons';
import { api } from '@/lib/api';
import type { CarPhoto } from '@/lib/report-data';
import type { LedgerItem, MyCar, TimelineItem } from '@/lib/types';
import { RecordsList } from './records-list';
import { QuestionNav, ReportHero, ReportSections } from './report-view';
import { TimelineList } from './timeline-list';

export type EmbeddedReportParams = { view?: string; class?: string; error?: string; cdone?: string; cerror?: string; shared?: string };
const VIEWS = [['report', 'Report'], ['timeline', 'Timeline'], ['records', 'Records']] as const;

export async function EmbeddedReport({ vehicleRef: ref, base, sp }: { vehicleRef: string; base: string; sp: EmbeddedReportParams }) {
  const at = (q: Record<string, string | undefined>) => {
    const u = new URL(base, 'http://x');
    for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
    return `${u.pathname}${u.search}`;
  };
  const view = VIEWS.some(([v]) => v === sp.view) ? sp.view! : 'report';
  const data = await loadVehicle(ref);
  if (data.kind === 'summary') return <p className="text-muted">Only the public summary of this car is available to you.</p>;
  const r = data.report;
  const items = <T,>(p: Promise<{ items: T[] }>) => p.then((x) => x.items).catch(() => undefined);
  const [saved, mine, timeline, ledger, photos] = await Promise.all([
    api<{ saved: boolean }>(`/me/saved-checks/${ref}`, { auth: true }).then((x) => x.saved).catch(() => false),
    api<{ items: MyCar[] }>('/me/cars', { auth: true }).then((x) => x.items.find((c) => c.vehicleRef === ref && c.status !== 'rejected')).catch(() => undefined),
    items(api<{ items: TimelineItem[] }>(`/vehicles/${ref}/timeline`, { auth: true })),
    items(api<{ items: LedgerItem[] }>(`/vehicles/${ref}/evidence`, { auth: true })),
    items(api<{ items: CarPhoto[] }>(`/vehicles/${ref}/photos`, { auth: true })),
  ]);
  const x = { timeline, ledger, photos };
  const here = at({ view: undefined, class: undefined, error: undefined, cdone: undefined, cerror: undefined, shared: undefined });
  const back = <input type="hidden" name="back" value={here} />;
  const h = await headers();
  const shareUrl = sp.shared && /^[A-Za-z0-9_-]{22,64}$/.test(sp.shared) ? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}/shared/${sp.shared}` : undefined;

  const actions = (
    <>
      <form action={saved ? unsaveCar : saveCar}><input type="hidden" name="ref" value={ref} />{back}
        <button className="btn btn-ghost" aria-pressed={saved}><Icon name={saved ? 'bookmark_added' : 'bookmark'} />{saved ? 'Saved' : 'Save this car'}</button></form>
      <Link href={`/compare?r=${ref}`} className="btn btn-ghost"><Icon name="compare_arrows" />Compare</Link>
      <Link href={`/inspections/book?${new URLSearchParams({ ref, ...(r.vehicle.currentPlate ? { plate: r.vehicle.currentPlate } : {}) })}`} className="btn btn-ghost"><Icon name="fact_check" />Book an inspection</Link>
      <PrintButton primary />
      {mine ? (
        <Link href={mine.status === 'verified' ? `/my-cars/${ref}` : '/my-cars'} className="btn btn-ghost"><Icon name="key" />{mine.status === 'verified' ? 'Your car' : 'Logbook being checked'}</Link>
      ) : (
        <form action={claimCar}><input type="hidden" name="ref" value={ref} />
          <button className="btn btn-ghost"><Icon name="key" />This is my car</button></form>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Report views" className="flex flex-wrap gap-2">
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={at({ view: v === 'report' ? undefined : v, class: undefined })} aria-current={view === v ? 'true' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${view === v ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-card hover:border-primary-container'}`}>{label}</Link>
        ))}
      </nav>
      {shareUrl && (
        <section id="share-link" className="scroll-mt-24 rounded-[14px] border border-ok-line bg-ok-fill p-4 md:p-5" aria-labelledby="share-link-h">
          <h2 id="share-link-h" className="font-display text-lg font-bold">Your link is ready</h2>
          <p className="mt-1 text-sm">Anyone with this link can see this report for 30 days, without signing in. It is a copy frozen today. Owners&apos; names and garage costs are never included.</p>
          <p className="sazo-id mt-3 break-all rounded-lg bg-card p-3 text-sm normal-case tracking-normal">{shareUrl}</p>
          <div className="mt-3"><ShareButtons url={shareUrl} title="SAZO vehicle report" /></div>
        </section>
      )}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {view === 'timeline' && (
        <section aria-labelledby="tl-h" className="space-y-4">
          <h2 id="tl-h" className="font-display text-xl font-bold">Timeline</h2>
          {timeline ? <TimelineList items={timeline} /> : <p className="text-muted">The timeline is not available to you.</p>}
        </section>
      )}
      {view === 'records' && (
        <section aria-labelledby="rec-h">
          <h2 id="rec-h" className="font-display text-xl font-bold">Every record</h2>
          {ledger ? <RecordsList all={ledger} cls={sp.class ?? 'all'} hrefFor={(c) => at({ view: 'records', class: c === 'all' ? undefined : c })} /> : <p className="text-muted">The records are not available to you.</p>}
        </section>
      )}
      {view === 'report' && (
        <>
          <ReportHero r={r} x={x} actions={actions} photoHref={(id) => `/v/${ref}/photo/${id}`} embedded />
          <QuestionNav questions={r.questions} embedded />
          <ReportSections r={r} x={x} />
          {/* Inside a workspace the report stops after the seven questions (28 Oct 2026): no "Before you pay" card,
              owners' reviews or closing note; Timeline and Records are the buttons above. */}
        </>
      )}
    </div>
  );
}
