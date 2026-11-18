// A broker follows a sale they brought (D-191): how their customer is paying, and the car. View only: the dealer
// records every payment. Only the broker's own sales; SAZO shows no payment methods, references, costs or notes.
import { formatDate, formatKm } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { ApiError, api, isSignedIn } from '@/lib/api';
import { localPhone } from '@/lib/phone';
import type { Me } from '@/lib/types';
import { PAY } from '../../labels';

export const metadata: Metadata = { title: 'A sale you brought · SAZO' };

interface Row { seq: number; dueOn: string; amountUgx: number; paidUgx: number; owingUgx: number; status: string; daysLate: number; daysLeft: number }
interface Sale {
  commissionId: string; commission: { amountUgx: number; status: string }; dealer: { name: string; logoId: string | null }; soldOn: string | null;
  buyer: { name: string | null; phone: string | null };
  car: { name: string; plate: string | null; vehicleRef: string | null; make: string | null; model: string | null; modelYear: number | null; mileageKm: number | null; colour: string | null; engineCc: number | null; fuel: string | null; transmission: string | null };
  plan: { kind: 'cash' | 'instalments'; priceUgx: number; paidUgx: number; balanceUgx: number; state: 'paid' | 'late' | 'owing'; daysLate: number; next: { seq: number; dueOn: string; owingUgx: number } | null; schedule: Row[] } | null;
}

const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const FUEL: Record<string, string> = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric', lpg: 'Gas (LPG)' };
const GEARS: Record<string, string> = { automatic: 'Automatic', manual: 'Manual', cvt: 'CVT' };

function pill(r: Row): [string, string] {
  if (r.owingUgx === 0) return ['Paid', 'bg-ok-fill text-ok-text'];
  if (r.paidUgx > 0) return ['Part paid', 'bg-warn-fill text-warn-text'];
  if (r.status === 'late') return ['Not paid', 'bg-bad-fill text-bad-text'];
  return [r.status === 'due_soon' ? 'Due soon' : 'Coming', 'bg-soft text-muted'];
}

export default async function BrokerSale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/broker/sales/${id}`);
  const [me, sale] = await Promise.all([
    api<Me>('/me', { auth: true }),
    api<Sale>(`/broker/sales/${id}`, { auth: true }).catch((e) => { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null; throw e; }),
  ]);
  if (!sale) notFound();
  const p = sale.plan;
  const pct = p && p.priceUgx ? Math.min(100, Math.round((p.paidUgx / p.priceUgx) * 100)) : 0;
  const done = p ? p.schedule.filter((r) => r.owingUgx === 0).length : 0;
  const c = sale.car;
  const facts: [string, string][] = ([
    ['Make', c.make], ['Model', c.model], ['Year', c.modelYear ? String(c.modelYear) : null], ['Number plate', c.plate],
    ['Mileage', c.mileageKm != null ? formatKm(c.mileageKm) : null], ['Colour', c.colour], ['Engine', c.engineCc ? `${n0(c.engineCc)} cc` : null],
    ['Fuel', c.fuel ? FUEL[c.fuel] ?? c.fuel : null], ['Gearbox', c.transmission ? GEARS[c.transmission] ?? c.transmission : null],
  ] as [string, string | null][]).filter((f): f is [string, string] => !!f[1]);

  return (
    <AppFrame workspace="broker" viewer={{ platformRoles: me.platformRoles }} business={{ name: me.displayName, approved: true, badge: 'Approved broker' }}>
      <div className="space-y-4">
        <Link href="/broker?tab=commissions" className="btn-soft"><Icon name="arrow_back" />My commission</Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{c.name}{c.plate ? ` · ${c.plate}` : ''}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            {sale.dealer.logoId && <Avatar name={sale.dealer.name} pictureId={sale.dealer.logoId} size={24} logo />}
            <span>Sold by {sale.dealer.name}{sale.buyer.name ? ` to ${sale.buyer.name}` : ''}{sale.soldOn ? ` on ${formatDate(sale.soldOn)}` : ''}.</span>
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-soft px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-muted">
            <Icon name="visibility" size={16} />View only. The dealer records the payments.
          </p>
        </div>

        <section aria-labelledby="pay-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
          <h2 id="pay-h" className="!font-sans !text-xs font-extrabold uppercase tracking-wider !text-label">How the buyer is paying</h2>
          {!p ? <p className="mt-2 text-muted">The dealer has not recorded how the buyer pays yet.</p> : (
            <>
              <p className="mt-2"><b className="font-display text-2xl font-extrabold tabular-nums md:text-3xl">UGX {n0(p.paidUgx)}</b> <span className="text-muted">paid of UGX {n0(p.priceUgx)}</span></p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-soft-3" role="progressbar" aria-label="Paid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className="h-full rounded-full bg-primary-container" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-sm text-muted">{pct}% paid · {done} of {plural(p.schedule.length, 'payment')}</p>
              {p.state === 'paid' ? <p className="mt-3 rounded-lg bg-ok-fill p-2.5 font-bold text-ok-text">Paid in full</p>
                : p.state === 'late' ? <p className="mt-3 rounded-lg bg-bad-fill p-2.5 font-bold text-bad-text">A payment is late: {plural(p.daysLate, 'day')}</p>
                : <p className="mt-3 rounded-lg bg-ok-fill p-2.5 font-bold text-ok-text">On time</p>}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {p.next && <div className="rounded-xl border border-line bg-soft/60 p-3"><dt className="text-xs font-bold uppercase tracking-wider text-label">Next payment</dt><dd className="mt-1 font-bold">{formatDate(p.next.dueOn)} · {n0(p.next.owingUgx)}</dd></div>}
                <div className="rounded-xl border border-line bg-soft/60 p-3"><dt className="text-xs font-bold uppercase tracking-wider text-label">Balance</dt><dd className="mt-1 font-bold tabular-nums">{n0(p.balanceUgx)}</dd></div>
                <div className="rounded-xl border border-line bg-soft/60 p-3"><dt className="text-xs font-bold uppercase tracking-wider text-label">Your commission</dt><dd className="mt-1 font-bold">{n0(sale.commission.amountUgx)} · {PAY[sale.commission.status] ?? sale.commission.status}</dd></div>
                {sale.buyer.phone && (
                  <div className="rounded-xl border border-line bg-soft/60 p-3"><dt className="text-xs font-bold uppercase tracking-wider text-label">Buyer&apos;s phone</dt>
                    <dd className="mt-1"><a className="font-bold text-primary-container" href={`tel:${sale.buyer.phone}`}>{localPhone(sale.buyer.phone)}</a></dd></div>
                )}
              </dl>
            </>
          )}
        </section>

        {p && (
          <section aria-labelledby="sch-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
            <h2 id="sch-h" className="font-display text-lg font-bold text-primary-container">Payments</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="stack-table w-full text-left text-sm">
                <thead className="border-b border-line text-[11px] uppercase tracking-wider text-label">
                  <tr><th className="py-2 pr-3">Payment</th><th className="py-2 pr-3">Due</th><th className="py-2 pr-3 text-right">Amount (UGX)</th><th className="py-2 pr-3 text-right">Paid (UGX)</th><th className="py-2 pr-3">Days left</th><th className="py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.schedule.map((r) => {
                    const [label, tone] = pill(r);
                    return (
                      <tr key={r.seq}>
                        <td data-label="Payment" className="py-2.5 pr-3 font-semibold">{r.seq === 0 ? (p.kind === 'cash' ? 'Paid in full' : 'Deposit') : `Payment ${r.seq}`}</td>
                        <td data-label="Due" className="whitespace-nowrap py-2.5 pr-3">{formatDate(r.dueOn)}</td>
                        <td data-label="Amount (UGX)" className="py-2.5 pr-3 text-right tabular-nums">{n0(r.amountUgx)}</td>
                        <td data-label="Paid (UGX)" className="py-2.5 pr-3 text-right tabular-nums">{n0(r.paidUgx)}</td>
                        <td data-label="Days left" className="whitespace-nowrap py-2.5 pr-3">{r.status === 'late' ? <b className="text-bad-text">{plural(r.daysLate, 'day')} late</b> : plural(r.daysLeft, 'day')}</td>
                        <td data-label="Status" className="py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${tone}`}>{label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section aria-labelledby="car-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
          <details open>
            <summary id="car-h" className="cursor-pointer font-display text-lg font-bold text-primary-container">About the car</summary>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
              {facts.map(([k, v]) => <div key={k} className="rounded-xl border border-line p-3"><dt className="text-xs font-bold uppercase tracking-wider text-label">{k}</dt><dd className="mt-1 font-semibold">{v}</dd></div>)}
            </dl>
            {c.vehicleRef && <Link href={`/v/${c.vehicleRef}`} className="btn-soft mt-3">See the SAZO report for this car<Icon name="arrow_forward" /></Link>}
          </details>
        </section>
      </div>
    </AppFrame>
  );
}
