import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';
import { DOMAIN_NAMES } from '@/lib/partner';
import type { PartnerSource } from '@/lib/types';

export const metadata: Metadata = { title: 'Send records', robots: { index: false } };


export default async function Partner() {
  if (!(await isSignedIn())) redirect('/sign-in?next=/partner');
  const sources = (await api<PartnerSource[]>('/ingest/sources', { auth: true })).filter((s) => DOMAIN_NAMES[s.domain]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Send records to SAZO</h1>
      <p className="mt-1 text-muted">Choose the data source you are entering records for. Each source can only send its own kinds of record.</p>
      {sources.length === 0 ? (
        <p className="card mt-6 p-4">Your account isn&apos;t linked to a data source. Ask SAZO to add you as an operator for your organisation.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {sources.map((s) => (
            <li key={s.code}>
              <Link href={`/partner/${s.code}`} className="card flex items-start justify-between gap-3 p-4 hover:border-line-strong">
                <span>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-label">{DOMAIN_NAMES[s.domain]}</span>
                  <span className="block font-semibold">{s.name}</span>
                  <span className="sazo-id text-sm text-muted">{s.code}</span>
                  {s.isSimulated && <span className="chip mt-2 border-warn-line bg-warn-fill text-warn-text">Simulated</span>}
                </span>
                <Icon name="chevron_forward" className="mt-1 shrink-0 text-label" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
