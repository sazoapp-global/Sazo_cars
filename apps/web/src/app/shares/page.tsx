import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ShareButtons } from '@/components/share-buttons';
import { api, isSignedIn } from '@/lib/api';
import type { ShareLink } from '@/lib/types';
import { revokeShare } from '../buyer-actions';

export const metadata: Metadata = { title: 'Shared reports', robots: { index: false } };

export default async function Shares({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/shares');
  const token = (await searchParams).new;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const { items } = await api<{ items: ShareLink[] }>('/me/shares', { auth: true });
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 md:px-8">
      {token && /^[A-Za-z0-9_-]{22,64}$/.test(token) && (
        <section className="card p-5" aria-labelledby="ready">
          <h1 id="ready" className="font-display text-2xl font-bold">Your link is ready</h1>
          <p className="mt-1 text-muted">Anyone with this link can see this report for 30 days, without signing in. It is a copy frozen today — new records won&apos;t change it. Owners&apos; names and garage costs are never included.</p>
          <p className="sazo-id mt-3 break-all rounded-lg bg-soft p-3 text-sm normal-case tracking-normal">{`${origin}/shared/${token}`}</p>
          <div className="mt-3"><ShareButtons url={`${origin}/shared/${token}`} title="SAZO vehicle report" /></div>
          <p className="mt-3 text-sm text-muted">To save a PDF, open the link and choose <strong>Save as PDF</strong>.</p>
        </section>
      )}
      <section aria-labelledby="links">
        <h2 id="links" className="font-display text-lg font-semibold">Links you have shared</h2>
        {items.length === 0 ? <p className="mt-2 text-muted">None yet.</p> : (
          <ul className="card mt-2 divide-y divide-line">
            {items.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span><span className="sazo-id font-semibold">{l.plate ?? l.vehicleRef}</span> <span className="text-sm text-muted">· {formatDate(l.createdAt)} · {l.revoked ? 'stopped' : l.expiresAt && Date.parse(l.expiresAt) < Date.now() ? 'expired' : `works until ${formatDate(l.expiresAt)}`}</span></span>
                {!l.revoked && <form action={revokeShare}><input type="hidden" name="id" value={l.id} /><button className="btn btn-ghost !min-h-10 text-sm">Stop this link</button></form>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
