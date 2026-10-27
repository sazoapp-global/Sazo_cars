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

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
    </dl>
  );
}

export default async function YourData() {
  if (!(await isSignedIn())) redirect('/sign-in?next=/account/data');
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
          {p.businesses.map((b) => (
            <div key={`${b.legalName}-${b.registeredAt}`} className="rounded-lg border border-line p-3">
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
      </Section>

      <Section id="cars" title="Cars you own" empty={!d.myCars.length}>
        <Rows rows={d.myCars.map((c) => [c.vehicleRef, `${CLAIM[c.status] ?? c.status} · ${formatDate(c.claimedAt)}`])} />
      </Section>

      <Section id="saved" title="Saved cars" empty={!d.savedCars.length}>
        <Rows rows={d.savedCars.map((c) => [c.vehicleRef, `Saved ${formatDate(c.savedAt)}`])} />
      </Section>

      <Section id="shares" title="Reports you shared" empty={!d.sharedReports.length}>
        <Rows rows={d.sharedReports.map((s) => [`${s.plate ?? s.vehicleRef} · ${s.snapshotRef}`,
          `${formatDate(s.createdAt)} · ${s.revoked ? 'link stopped' : s.expiresAt ? `link until ${formatDate(s.expiresAt)}` : 'link active'}`])} />
      </Section>

      <Section id="reviews" title="Your reviews and video suggestions" empty={!d.reviews.length && !d.videoSuggestions.length}>
        <ul className="divide-y divide-line">
          {d.reviews.map((r) => <li key={`r-${r.createdAt}`} className="py-2"><span className="font-semibold">{r.rating}/5</span> · {MODERATION[r.status] ?? r.status} · {formatDate(r.createdAt)}<p className="text-muted">{r.body}</p></li>)}
          {d.videoSuggestions.map((v) => <li key={`v-${v.createdAt}`} className="py-2"><span className="font-semibold">{v.title ?? 'Video'}</span> · {MODERATION[v.status] ?? v.status} · {formatDate(v.createdAt)}<p className="break-all text-muted">{v.url}</p></li>)}
        </ul>
      </Section>

      <Section id="devices" title="Signed-in devices" empty={!d.devices.length}>
        <Rows rows={d.devices.map((x) => [`${deviceName(x.device)}${x.current ? ' (this device)' : ''}`, `Signed in ${formatDate(x.signedInAt)} · last used ${formatDate(x.lastUsedAt)}`])} />
      </Section>
    </div>
  );
}
