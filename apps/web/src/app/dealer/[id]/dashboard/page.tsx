import { formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation } from '@/lib/types';
import { DashCard, Pill, SalesChart, longDate, monthName } from '../../dashboard-bits';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } };

interface DueSoon {
  planId: string; car: { name: string; plate: string | null }; buyer: { name: string | null }; state: string; daysLate: number; lateUgx: number;
  next: { seq: number; dueOn: string; owingUgx: number; status: string } | null;
}
interface Dashboard {
  manager: boolean; month: string;
  stock: { count: number; olderThanDays: number; older: number };
  soldThisMonth: { cars: number; valueUgx?: number; onInstalments?: number };
  enquiries: { open: number; waiting: number; viewings: number };
  mySales: { thisMonth: number; thisYear: number };
  shareLinks: number;
  monthly: { month: string; cars: number; valueUgx?: number }[];
  payments?: { owedUgx: number; owingSales: number; lateUgx: number; lateBuyers: number; dueSoon: DueSoon[] };
  commissions?: { toApprove: number; amountUgx: number };
}

const greeting = () => {
  const h = (new Date().getUTCHours() + 3) % 24; // Kampala
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
/** Messages shown when another page sends someone here (fixed texts: nothing from the address is shown). */
const ERRORS: Record<string, string> = { managers_only: 'Payments is for managers of this business. Ask a manager if a buyer has paid or owes money.' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The dealer's first page (D-146): cards that open each part of the console, and sales by month. */
export default async function DealerDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ chart?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/dashboard`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status !== 'approved') redirect(`/dealer/${id}`);
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const [d, me] = await Promise.all([api<Dashboard>('/dealer/dashboard', as), api<Me>('/me', { auth: true }).catch(() => undefined)]);
  const show = d.manager && sp.chart !== 'cars' ? 'value' : 'cars';
  const month = monthName(d.month);
  const base = `/dealer/${id}`;
  const firstName = me?.displayName.split(' ').at(-1) ?? '';

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved: true }} business={{ name: org.tradingName ?? org.legalName, approved: true }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}
      badges={{ enquiries: d.enquiries.waiting, ...(d.payments?.lateBuyers ? { payments: d.payments.lateBuyers } : {}) }}>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="mt-1 text-muted">{org.tradingName ?? org.legalName} at a glance. Click a card to open it.{d.manager ? '' : ' Money amounts are for managers.'}</p>
      </div>
      {sp.error && ERRORS[sp.error] && <p role="alert" className="rounded-lg border border-warn-line bg-warn-fill p-3 font-semibold text-warn-text">{ERRORS[sp.error]}</p>}

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DashCard href={base} icon="storefront" label="Cars in stock" value={String(d.stock.count)}
          sub={d.stock.older ? `${d.stock.older} over ${d.stock.olderThanDays} days` : `None over ${d.stock.olderThanDays} days`} />
        <DashCard href={`${base}?show=sold`} icon="sell" label={`Sold in ${month}`} value={plural(d.soldThisMonth.cars, 'car')} tone="lime"
          sub={d.manager ? `${formatUgx(d.soldThisMonth.valueUgx ?? 0)}${d.soldThisMonth.onInstalments ? ` · ${d.soldThisMonth.onInstalments} on instalments` : ''}` : `${d.mySales.thisMonth} sold by you`} />
        <DashCard href={`${base}/enquiries`} icon="forum" label="Open enquiries" value={String(d.enquiries.open)}
          sub={d.enquiries.waiting ? `${d.enquiries.waiting} new, not yet answered` : 'All answered'} />
        {d.manager && d.payments ? (
          <>
            <DashCard href={`${base}/payments?show=owing`} icon="savings" label="Still owed to you" value={formatUgx(d.payments.owedUgx)}
              sub={d.payments.owingSales ? `on ${plural(d.payments.owingSales, 'sale')}` : 'Nothing owed'} />
            <DashCard href={`${base}/payments?show=late`} icon="warning" label="Late payments" value={String(d.payments.lateBuyers)}
              sub={d.payments.lateUgx ? `${formatUgx(d.payments.lateUgx)} overdue` : 'None late'} tone={d.payments.lateBuyers ? 'bad' : undefined} />
            <DashCard href={`${base}/commissions`} icon="handshake" label="Commission to approve" value={String(d.commissions?.toApprove ?? 0)}
              sub={d.commissions?.toApprove ? `${formatUgx(d.commissions.amountUgx)} to brokers` : 'Nothing waiting'} />
          </>
        ) : (
          <>
            <DashCard href={`${base}/enquiries`} icon="calendar_month" label="Viewings" value={String(d.enquiries.viewings)} sub="Enquiries at the viewing stage" />
            <DashCard href={base} icon="share" label="Shared links" value={String(d.shareLinks)} sub="Links buyers can open" />
            <DashCard href={`${base}?show=sold`} icon="star" label="Your sales this year" value={plural(d.mySales.thisYear, 'car')} />
          </>
        )}
      </section>

      <div className={`grid gap-4 ${d.manager ? 'xl:grid-cols-[1.6fr_1fr]' : ''}`}>
        <section aria-labelledby="sales-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="sales-h" className="font-display text-lg font-bold">{d.manager ? 'Sales by month' : 'Cars sold by month'}</h2>
            {d.manager && (
              <nav aria-label="Show" className="flex rounded-lg bg-soft p-1 text-sm font-semibold">
                <Link href={`${base}/dashboard`} aria-current={show === 'value' ? 'true' : undefined} className={`rounded-md px-3 py-1 ${show === 'value' ? 'bg-card text-primary-container shadow-sm' : 'text-muted'}`}>Value (UGX)</Link>
                <Link href={`${base}/dashboard?chart=cars`} aria-current={show === 'cars' ? 'true' : undefined} className={`rounded-md px-3 py-1 ${show === 'cars' ? 'bg-card text-primary-container shadow-sm' : 'text-muted'}`}>Cars sold</Link>
              </nav>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Last 12 months{show === 'value' ? '. The number on each bar is the cars sold' : ''}. This month in lime.</p>
          <SalesChart monthly={d.monthly} show={show} />
        </section>

        {d.manager && d.payments && (
          <section aria-labelledby="due-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
            <h2 id="due-h" className="font-display text-lg font-bold">Late and due soon</h2>
            <p className="text-xs text-muted">Buyers who agreed get an SMS before and on the due date.</p>
            {d.payments.dueSoon.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing late or due in the next 7 days.</p> : (
              <ul className="mt-2 divide-y divide-line">
                {d.payments.dueSoon.map((p) => (
                  <li key={p.planId}>
                    <Link href={`${base}/payments?plan=${p.planId}`} className="flex items-start justify-between gap-3 py-2.5 hover:text-primary-container">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{p.car.name}{p.car.plate ? ` · ${p.car.plate}` : ''}</span>
                        <span className="block truncate text-xs text-muted">{p.buyer.name ?? 'Buyer'}{p.next ? ` · due ${longDate(p.next.dueOn)}` : ''}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <Pill state={p.state === 'late' ? 'late' : 'due_soon'} text={p.state === 'late' ? `${plural(p.daysLate, 'day')} late` : 'Due soon'} />
                        <span className="block font-bold tabular-nums">{formatUgx(p.state === 'late' ? p.lateUgx : p.next?.owingUgx ?? 0)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AppFrame>
  );
}
