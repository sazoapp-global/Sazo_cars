// Your data inside the page you are on (D-157, 4 Nov 2026): opened from "Download my data" in Settings, in the same
// white space (?panel=data), never on a new page. On screen it shows only your details and your businesses; the
// PDF and Excel files still hold everything SAZO keeps about you (D-147).
import { formatDate } from '@sazo/contracts';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { api } from '@/lib/api';
import { BUSINESS_STATUS, BUSINESS_TYPE, type DataExport, ROLE } from '@/lib/data-export';
import { localPhone } from '@/lib/phone';

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
    </dl>
  );
}

export async function YourDataView() {
  const d = await api<DataExport>('/me/export', { auth: true }).catch(() => undefined);
  if (!d) return <p className="card p-4">Your data could not be loaded. Try again.</p>;
  const p = d.profile;
  return (
    <div className="space-y-4">
      <p className="text-muted">Your details and your businesses as SAZO holds them. The PDF and Excel files hold everything SAZO keeps about you. Prepared {formatDate(d.exportedAt)}.</p>
      <div className="flex flex-wrap gap-2">
        <a href="/account/data/download?format=pdf" className="btn btn-primary"><Icon name="download" />Download PDF</a>
        <a href="/account/data/download?format=xlsx" className="btn btn-ghost"><Icon name="download" />Download Excel</a>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="data-you">
          <h2 id="data-you" className="font-display text-lg font-semibold">Your details</h2>
          <div className="mt-2">
            <Rows rows={[
              ['Name', p.displayName ?? 'Not given'],
              ['Phone', p.phone ? localPhone(p.phone) : 'Not given'],
              ...(p.email ? [['Email', p.email] as [string, ReactNode]] : []),
              ['Texts asking you to confirm garage visits', d.preferences.visitConfirmationTexts ? 'On' : 'Off'],
            ]} />
          </div>
        </section>
        <section className="card p-5" aria-labelledby="data-biz">
          <h2 id="data-biz" className="font-display text-lg font-semibold">Your businesses</h2>
          {!p.businesses.length ? <p className="mt-1 text-muted">None.</p> : (
            <div className="mt-2 space-y-4">
              {p.businesses.map((b) => (
                <div key={`${b.legalName}-${b.registeredAt}`} className="rounded-lg border border-line p-3">
                  <h3 className="font-semibold">{b.name}</h3>
                  <Rows rows={[
                    ['Type', BUSINESS_TYPE[b.type] ?? b.type],
                    ['Registered name', b.legalName],
                    ...(b.tradingName ? [['Trading name', b.tradingName] as [string, ReactNode]] : []),
                    ['Registration number', b.registrationNumber ?? 'Not recorded'],
                    ['District', b.district ?? 'Not recorded'],
                    ['Status', BUSINESS_STATUS[b.status] ?? b.status],
                    ['Your role', ROLE[b.yourRole] ?? b.yourRole],
                    ['Registered on SAZO', b.registeredAt ? formatDate(b.registeredAt) : 'Not recorded'],
                    ['Documents sent', String(b.documentsSent)],
                  ]} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
