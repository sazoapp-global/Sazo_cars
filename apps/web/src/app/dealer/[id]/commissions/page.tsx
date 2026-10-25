import { formatDate, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { NumberStrip, WorkspaceFrame } from '@/components/workspace-frame';
import { api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation } from '@/lib/types';
import { commissionAction } from '../../actions';

export const metadata: Metadata = { title: 'Broker commission', robots: { index: false } };

interface Commission {
  commissionId: string; leadId: string; stockId: string; broker: string; status: string; kind: 'fixed' | 'percent'; percent: number | null; salePriceUgx: number;
  sharePercent: number; amountUgx: number; paidReference: string | null; createdAt: string;
}
const STATUS: Record<string, string> = { on_hold: 'On hold: decide who brought the customer', pending: 'Waiting for your approval', approved: 'Approved, not paid', paid: 'Paid', cancelled: 'Cancelled' };

type SP = Promise<{ done?: string; error?: string }>;

/** Broker commission records for this dealer's sales (D-122, D-129). Managers only; no money moves through SAZO. */
export default async function Commissions({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/commissions`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status !== 'approved') redirect(`/dealer/${id}`);
  if (org.role !== 'org_manager') redirect(`/dealer/${id}?error=${encodeURIComponent('Only a manager of this business can open that page.')}`);
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const [{ items }, me] = await Promise.all([api<{ items: Commission[] }>('/dealer/commissions', as), api<Me>('/me', { auth: true }).catch(() => undefined)]);
  const sum = (st: string[]) => items.filter((c) => st.includes(c.status)).reduce((n, c) => n + c.amountUgx, 0);
  const hidden = (c: Commission) => <><input type="hidden" name="org" value={id} /><input type="hidden" name="commission" value={c.commissionId} /></>;

  return (
    <WorkspaceFrame kind="Dealer" name={org.tradingName ?? org.legalName} approved person={me ? { name: me.displayName, role: 'Manager' } : undefined}
      items={[
        { href: `/dealer/${id}`, label: 'For sale', icon: 'storefront' },
        { href: `/dealer/${id}/enquiries`, label: 'Enquiries', icon: 'forum' },
        { href: `/dealer/${id}/commissions`, label: 'Commission', icon: 'payments', active: true },
        { href: `/dealer/${id}?show=sold`, label: 'Sold', icon: 'sell' },
      ]}>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Broker commission</h1>
        <p className="mt-1 max-w-2xl text-muted">Worked out when a sale a broker brought is completed, from the car&apos;s commission at that moment. SAZO keeps the record; you pay the broker directly.</p>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
      <NumberStrip cells={[
        { label: 'To approve', value: formatUgx(sum(['pending'])) },
        { label: 'On hold', value: formatUgx(sum(['on_hold'])) },
        { label: 'Approved, not paid', value: formatUgx(sum(['approved'])) },
        { label: 'Paid', value: formatUgx(sum(['paid'])) },
      ]} />
      {items.length === 0 ? <p className="rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">No commission yet.</p> : (
        <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label="Commissions">
          {items.map((c) => (
            <li key={c.commissionId} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{c.broker}</p>
                  <p className="text-muted">Sold for {formatUgx(c.salePriceUgx, false)} on {formatDate(c.createdAt)}. {c.kind === 'fixed' ? 'Fixed commission' : `${c.percent}% of the selling price`}{c.sharePercent < 100 ? `, ${c.sharePercent}% share` : ''}{c.paidReference ? `. Reference: ${c.paidReference}` : ''}</p>
                </div>
                <div className="sm:text-right"><p className="font-display text-lg font-extrabold tabular-nums">{formatUgx(c.amountUgx, false)}</p><p className="text-muted">{STATUS[c.status] ?? c.status}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.status === 'pending' && <form action={commissionAction}>{hidden(c)}<input type="hidden" name="action" value="approve" /><button className="btn btn-primary !min-h-10">Approve</button></form>}
                {c.status === 'approved' && (
                  <form action={commissionAction} className="flex gap-2">{hidden(c)}<input type="hidden" name="action" value="paid" />
                    <label htmlFor={`ref-${c.commissionId}`} className="sr-only">Payment reference</label>
                    <input id={`ref-${c.commissionId}`} name="note" placeholder="Payment reference, e.g. MTN 1234" className="field !min-h-10" />
                    <button className="btn btn-primary !min-h-10 shrink-0">Mark paid</button>
                  </form>
                )}
                {['on_hold', 'pending', 'approved'].includes(c.status) && (
                  <details><summary className="btn btn-ghost !min-h-10 cursor-pointer list-none">Cancel</summary>
                    <form action={commissionAction} className="mt-2 flex gap-2">{hidden(c)}<input type="hidden" name="action" value="cancel" />
                      <label htmlFor={`why-${c.commissionId}`} className="sr-only">Why is it cancelled?</label>
                      <input id={`why-${c.commissionId}`} name="note" required minLength={3} placeholder="Why?" className="field !min-h-10" />
                      <button className="btn btn-ghost !min-h-10 shrink-0">Cancel it</button>
                    </form></details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceFrame>
  );
}
