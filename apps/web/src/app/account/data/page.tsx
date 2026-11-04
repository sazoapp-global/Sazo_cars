import { Pager, pageHref, paginate } from '@/components/pager';
// "Download my data", readable: everything SAZO holds about the signed-in person, including the businesses
// they belong to. Downloads are a PDF or an Excel file (D-147); there is no JSON download.
import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';
import { BUSINESS_STATUS as STATUS, BUSINESS_TYPE as TYPE, CLAIM, type DataExport as Export, MODERATION, ROLE } from '@/lib/data-export';
import { deviceName, localPhone } from '@/lib/phone';

export const metadata: Metadata = { title: 'Your data', robots: { index: false } };

function Section({ id, title, empty, children }: { id: string; title: string; empty?: boolean; children: ReactNode }) {
  return (
    <section className="card p-5" aria-labelledby={id}>
      <h2 id={id} className="font-display text-lg font-semibold">{title}</h2>
      {empty ? <p className="mt-1 text-muted">None.</p> : <div className="mt-2">{children}</div>}
    </section>
  );
}

/** Pages of 10 on screen (4 Nov 2026); a printed copy keeps every row. `at` names this list's page in the address. */
type Paging = { sp: Record<string, string | undefined>; at: string; noun: string; section: string };
const shownOn = (paging: Paging | undefined, total: number) => (paging ? paginate(Array.from({ length: total }, (_, i) => i), paging.sp[paging.at]) : undefined);
const pagerFor = (paging: Paging | undefined, total: number) => {
  const paged = shownOn(paging, total);
  return paged && paging ? <Pager paged={paged} href={(n) => `${pageHref('/account/data', paging.sp, paging.at)(n)}#${paging.section}`} noun={paging.noun} label={`Pages of ${paging.noun}`} scroll={false} /> : null;
};
const onScreen = (paging: Paging | undefined, total: number, i: number) => { const p = shownOn(paging, total); return !p || p.items.includes(i); };

function Rows({ rows, paging }: { rows: [string, ReactNode][]; paging?: Paging }) {
  return (
    <>
      <dl className="divide-y divide-line">
        {rows.map(([k, v], i) => <div key={`${k}-${i}`} className={`${onScreen(paging, rows.length, i) ? 'flex' : 'hidden print:flex'} justify-between gap-4 py-2`}><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
      </dl>
      {pagerFor(paging, rows.length)}
    </>
  );
}

export default async function YourData({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/account/data');
  const sp = await searchParams;
  const pg = (at: string, noun: string, section: string): Paging => ({ sp, at, noun, section });
  const d = await api<Export>('/me/export', { auth: true });
  const p = d.profile;
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 md:px-8">
      <Link href="/account" className="link inline-flex items-center gap-1 print:hidden"><Icon name="arrow_back" size={18} />Your account</Link>
      <div>
        <h1 className="font-display text-2xl font-bold">Your data held by SAZO</h1>
        <p className="mt-1 text-muted">Prepared {formatDate(d.exportedAt)}. Records about cars (services, inspections, registrations) belong to each car&apos;s history and are not included.</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <a href="/account/data/download?format=pdf" className="btn btn-primary"><Icon name="download" />Download PDF</a>
        <a href="/account/data/download?format=xlsx" className="btn btn-ghost"><Icon name="download" />Download Excel</a>
      </div>

      <Section id="you" title="Your details">
        <Rows rows={[
          ['Name', p.displayName ?? 'Not given'],
          ['Phone', p.phone ? localPhone(p.phone) : 'Not given'],
          ...(p.email ? [['Email', p.email] as [string, ReactNode]] : []),
          ['Texts asking you to confirm garage visits', d.preferences.visitConfirmationTexts ? 'On' : 'Off'],
        ]} />
      </Section>

      <Section id="biz" title="Your businesses" empty={!p.businesses.length}>
        <div className="space-y-4">
          {p.businesses.map((b, i) => (
            <div key={`${b.legalName}-${b.registeredAt}`} className={`rounded-lg border border-line p-3 ${onScreen(pg('bp', 'businesses', 'biz'), p.businesses.length, i) ? '' : 'hidden print:block'}`}>
              <h3 className="font-semibold">{b.name}</h3>
              <Rows rows={[
                ['Type', TYPE[b.type] ?? b.type],
                ['Registered name', b.legalName],
                ...(b.tradingName ? [['Trading name', b.tradingName] as [string, ReactNode]] : []),
                ['Registration number', b.registrationNumber ?? 'Not recorded'],
                ['District', b.district ?? 'Not recorded'],
                ['Status', STATUS[b.status] ?? b.status],
                ['Your role', ROLE[b.yourRole] ?? b.yourRole],
                ['Registered on SAZO', b.registeredAt ? formatDate(b.registeredAt) : 'Not recorded'],
                ['Documents sent', String(b.documentsSent)],
              ]} />
            </div>
          ))}
        </div>
        {pagerFor(pg('bp', 'businesses', 'biz'), p.businesses.length)}
      </Section>

      <Section id="cars" title="Cars you own" empty={!d.myCars.length}>
        <Rows paging={pg('cp', 'cars', 'cars')} rows={d.myCars.map((c) => [c.vehicleRef, `${CLAIM[c.status] ?? c.status} · ${formatDate(c.claimedAt)}`])} />
      </Section>

      <Section id="saved" title="Saved cars" empty={!d.savedCars.length}>
        <Rows paging={pg('svp', 'saved cars', 'saved')} rows={d.savedCars.map((c) => [c.vehicleRef, `Saved ${formatDate(c.savedAt)}`])} />
      </Section>

      <Section id="shares" title="Reports you shared" empty={!d.sharedReports.length}>
        <Rows paging={pg('shp', 'shared reports', 'shares')} rows={d.sharedReports.map((s) => [`${s.plate ?? s.vehicleRef} · ${s.snapshotRef}`,
          `${formatDate(s.createdAt)} · ${s.revoked ? 'link stopped' : s.expiresAt ? `link until ${formatDate(s.expiresAt)}` : 'link active'}`])} />
      </Section>

      <Section id="reviews" title="Your reviews and video suggestions" empty={!d.reviews.length && !d.videoSuggestions.length}>
        <ul className="divide-y divide-line">
          {d.reviews.map((r, i) => <li key={`r-${r.createdAt}`} className={`py-2 ${onScreen(pg('rp', 'reviews and videos', 'reviews'), d.reviews.length + d.videoSuggestions.length, i) ? '' : 'hidden print:block'}`}><span className="font-semibold">{r.rating}/5</span> · {MODERATION[r.status] ?? r.status} · {formatDate(r.createdAt)}<p className="text-muted">{r.body}</p></li>)}
          {d.videoSuggestions.map((v, i) => <li key={`v-${v.createdAt}`} className={`py-2 ${onScreen(pg('rp', 'reviews and videos', 'reviews'), d.reviews.length + d.videoSuggestions.length, d.reviews.length + i) ? '' : 'hidden print:block'}`}><span className="font-semibold">{v.title ?? 'Video'}</span> · {MODERATION[v.status] ?? v.status} · {formatDate(v.createdAt)}<p className="break-all text-muted">{v.url}</p></li>)}
        </ul>
        {pagerFor(pg('rp', 'reviews and videos', 'reviews'), d.reviews.length + d.videoSuggestions.length)}
      </Section>

      <Section id="devices" title="Signed-in devices" empty={!d.devices.length}>
        <Rows paging={pg('dp', 'devices', 'devices')} rows={d.devices.map((x) => [`${deviceName(x.device)}${x.current ? ' (this device)' : ''}`, `Signed in ${formatDate(x.signedInAt)} · last used ${formatDate(x.lastUsedAt)}`])} />
      </Section>
    </div>
  );
}
