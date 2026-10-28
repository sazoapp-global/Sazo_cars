import { formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { Icon } from '@/components/icon';
import { Popup } from '@/components/popup';
import { PrintButton } from '@/components/share-buttons';
import { api, isSignedIn } from '@/lib/api';
import { localPhone } from '@/lib/phone';
import type { Me, MyOrganisation } from '@/lib/types';
import { correctPayment, recordPayment } from '../../actions';
import { DashCard, METHOD, Pill, longDate, shortDate } from '../../dashboard-bits';
import { SaleForm, type BuyerChoice } from '../../sale-form';

export const metadata: Metadata = { title: 'Payments', robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Car = { stockId: string; name: string; plate: string | null };
type Next = { seq: number; dueOn: string; owingUgx: number; status: string; daysUntil: number } | null;
interface Item {
  planId: string; kind: 'cash' | 'instalments'; priceUgx: number; depositUgx: number; months: number | null; soldOn: string; paidUgx: number; balanceUgx: number;
  lateUgx: number; daysLate: number; next: Next; state: 'paid' | 'late' | 'owing'; car: Car; buyer: { name: string | null; phone?: string | null };
}
interface List {
  summary: { owedUgx: number; owingSales: number; receivedThisMonthUgx: number; receivedThisMonthCount: number; lateUgx: number; lateBuyers: number; dueSoonUgx: number; dueSoonBuyers: number };
  items: Item[]; unplanned: { car: Car; soldOn: string; salePriceUgx: number }[];
}
interface Payment { id: string; amountUgx: number; method: string; paidOn: string; reference: string | null; receiptNo: string; note: string | null; corrected: boolean; correctsPaymentId: string | null }
interface Detail extends Item {
  reminders: boolean; buyer: { name: string | null; phone: string | null };
  schedule: { seq: number; dueOn: string; amountUgx: number; paidUgx: number; owingUgx: number; status: string; daysLate: number }[];
  payments: Payment[];
}
interface Receipt {
  receiptNo: string; paidOn: string; amountUgx: number; method: string; reference: string | null; note: string | null;
  dealer: { name: string; phone: string | null }; buyer: { name: string | null; phone: string | null }; car: Car; priceUgx: number; balanceAfterUgx: number;
}
interface Lead { leadId: string; stockId: string | null; customer: { name: string | null; phone: string | null }; open: boolean; stage: string }

type SP = Promise<{ show?: string; sort?: string; within?: string; plan?: string; add?: string; receipt?: string; done?: string; error?: string }>;
const full = (n: number) => formatUgx(n, false);
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const carTitle = (c: Car) => `${c.name}${c.plate ? ` · ${c.plate}` : ''}`;
const FILTERS: [string, string][] = [['owing', 'Owing'], ['due', 'Due soon'], ['late', 'Late'], ['paid', 'Paid in full'], ['all', 'All']];
const SORTS: [string, string][] = [['due', 'Next due date'], ['late', 'Days late'], ['balance', 'Balance left'], ['sold', 'Date sold']];
const WITHIN = ['7', '14', '30'];
const defaultSort = (show: string) => (show === 'paid' || show === 'all' ? 'sold' : 'due');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "In 4 days", "Due today", "16 days late" */
function whenText(i: Item): string {
  if (!i.next) return '';
  if (i.state === 'late') return `${plural(i.daysLate, 'day')} late`;
  return i.next.daysUntil === 0 ? 'Due today' : `In ${plural(i.next.daysUntil, 'day')}`;
}

/** Payments for cars sold (D-146): records only; managers only. A sale opens with its plan beside the side bar. */
export default async function DealerPayments({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/payments`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status !== 'approved') redirect(`/dealer/${id}`);
  if (org.role !== 'org_manager') redirect(`/dealer/${id}/dashboard?error=managers_only`);
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const show = FILTERS.some(([k]) => k === sp.show) ? sp.show! : 'owing';
  const sort = SORTS.some(([k]) => k === sp.sort) ? sp.sort! : defaultSort(show);
  const within = WITHIN.includes(sp.within ?? '') ? sp.within! : '7';
  // The page keeps the chosen order and window as you move between filters.
  const query = (o: { show?: string; sort?: string; within?: string }) => {
    const q = new URLSearchParams({ show: o.show ?? show });
    const so = o.sort ?? (sp.sort ? sort : undefined);
    if (so && so !== defaultSort(o.show ?? show)) q.set('sort', so);
    const w = o.within ?? (sp.within ? within : undefined);
    if ((o.show ?? show) === 'due' && w && w !== '7') q.set('within', w);
    return `${base}?${q}`;
  };
  const plan = sp.plan && UUID.test(sp.plan) ? sp.plan : undefined;
  const [list, me] = await Promise.all([api<List>(plan ? '/dealer/payments?show=all' : `/dealer/payments?show=${show}&sort=${sort}${show === 'due' ? `&within=${within}` : ''}`, as), api<Me>('/me', { auth: true }).catch(() => undefined)]);
  const base = `/dealer/${id}/payments`;
  const notices = (
    <>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
    </>
  );
  const frame = (children: React.ReactNode) => (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved: true }} business={{ name: org.tradingName ?? org.legalName, approved: true }}
      person={me ? { name: me.displayName, role: 'Manager' } : undefined} badges={list.summary.lateBuyers ? { payments: list.summary.lateBuyers } : {}}>
      {children}
    </AppFrame>
  );

  // A sold car without a payment record: say how it is paid for.
  const adding = sp.add && UUID.test(sp.add) ? list.unplanned.find((u) => u.car.stockId === sp.add) : undefined;
  if (adding) {
    const leads = (await api<{ items: Lead[] }>('/dealer/leads', as).catch(() => ({ items: [] as Lead[] }))).items;
    const buyers: BuyerChoice[] = leads.filter((l) => l.stockId === adding.car.stockId && l.stage !== 'lost')
      .map((l) => ({ leadId: l.leadId, name: l.customer.name ?? 'Customer', phone: l.customer.phone ? localPhone(l.customer.phone) : null }));
    return frame(
      <>
        <p><Link href={base} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />All payments</Link></p>
        {notices}
        <section aria-labelledby="add-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
          <h1 id="add-h" className="font-display text-2xl font-bold">How is {carTitle(adding.car)} paid for?</h1>
          <p className="mb-4 mt-1 text-sm text-muted">Sold on {longDate(adding.soldOn)}.</p>
          <SaleForm org={id} carId={adding.car.stockId} salePriceUgx={adding.salePriceUgx} today={today()} manager buyers={buyers} mode="plan" />
        </section>
      </>,
    );
  }

  if (plan) {
    const d = await api<Detail>(`/dealer/payments/${plan}`, as).catch(() => undefined);
    if (!d) return frame(<><p><Link href={base} className="link text-sm">All payments</Link></p><p>This sale was not found.</p></>);
    const back = <p><Link href={base} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />All payments</Link></p>;

    const receiptId = sp.receipt && UUID.test(sp.receipt) ? sp.receipt : undefined;
    if (receiptId) {
      const r = await api<Receipt>(`/dealer/payments/${plan}/receipts/${receiptId}`, as).catch(() => undefined);
      if (r) {
        return frame(
          <>
            <p className="print:hidden"><Link href={`${base}?plan=${plan}`} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />Back to this sale</Link></p>
            <article aria-labelledby="rc-h" className="max-w-xl rounded-[14px] border border-line bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-wider text-label">Receipt</p><h1 id="rc-h" className="font-display text-2xl font-extrabold">{r.receiptNo}</h1></div>
                <div className="text-right"><p className="font-bold">{r.dealer.name}</p>{r.dealer.phone && <p className="text-sm text-muted">{localPhone(r.dealer.phone)}</p>}</div>
              </div>
              <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted">Date</dt><dd className="font-semibold">{longDate(r.paidOn)}</dd>
                <dt className="text-muted">Received from</dt><dd className="font-semibold">{r.buyer.name ?? 'Buyer'}{r.buyer.phone ? ` · ${localPhone(r.buyer.phone)}` : ''}</dd>
                <dt className="text-muted">For</dt><dd className="font-semibold">{carTitle(r.car)}</dd>
                <dt className="text-muted">Amount</dt><dd className="font-display text-xl font-extrabold tabular-nums">{full(r.amountUgx)}</dd>
                <dt className="text-muted">Paid by</dt><dd className="font-semibold">{METHOD[r.method] ?? r.method}{r.reference ? ` · ${r.reference}` : ''}</dd>
                {r.note && <><dt className="text-muted">Note</dt><dd>{r.note}</dd></>}
                <dt className="text-muted">Price</dt><dd className="tabular-nums">{full(r.priceUgx)}</dd>
                <dt className="text-muted">Balance after this</dt><dd className="font-bold tabular-nums">{full(r.balanceAfterUgx)}</dd>
              </dl>
              <p className="mt-6 text-xs text-muted">Recorded on SAZO by {r.dealer.name}. SAZO keeps the record; no money moves through SAZO.</p>
            </article>
            <div className="print:hidden"><PrintButton primary /></div>
          </>,
        );
      }
    }

    const latePay = d.schedule.filter((s) => s.status === 'late');
    return frame(
      <>
        {back}
        {notices}
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{carTitle(d.car)}</h1>
          <p className="mt-1 text-muted">
            Sold to {d.buyer.name ?? 'the buyer'}{d.buyer.phone ? ` (${localPhone(d.buyer.phone)})` : ''} on {longDate(d.soldOn)}
            {d.kind === 'cash' ? ', cash.' : `, ${d.depositUgx ? 'a deposit and ' : ''}${d.months} monthly payments.`}
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <section aria-labelledby="plan-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="plan-h" className="font-display text-lg font-bold">{d.kind === 'cash' ? 'Payment' : 'Instalment plan'}</h2>
              {d.balanceUgx > 0 && (
                <Popup title="Record a payment" button={<><Icon name="add" />Record a payment</>} buttonClassName="btn btn-primary !min-h-10">
                  <form action={recordPayment} className="space-y-3">
                    <input type="hidden" name="org" value={id} /><input type="hidden" name="plan" value={d.planId} />
                    <p className="text-sm text-muted">{carTitle(d.car)} · {d.buyer.name ?? 'Buyer'} · balance {full(d.balanceUgx)}</p>
                    <div><label htmlFor="pay-amount" className="label">Amount (UGX)</label>
                      <input id="pay-amount" name="amount" required inputMode="numeric" defaultValue={d.next ? d.next.owingUgx : d.balanceUgx} className="field tabular-nums" />
                      <p className="mt-1 text-xs text-muted">Goes to the oldest unpaid payment first.</p></div>
                    <div><label htmlFor="pay-method" className="label">How was it paid?</label>
                      <select id="pay-method" name="method" className="field" defaultValue="cash">{Object.entries(METHOD).filter(([k]) => k !== 'correction').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label htmlFor="pay-date" className="label">Date</label><input id="pay-date" name="paidOn" type="date" required min={d.soldOn} max={today()} defaultValue={today()} className="field" /></div>
                      <div><label htmlFor="pay-ref" className="label">Reference (optional)</label><input id="pay-ref" name="reference" maxLength={80} placeholder="MoMo ID, bank slip" className="field" /></div>
                    </div>
                    <p className="rounded-lg bg-lime/30 p-3 text-sm">{d.buyer.name ?? 'The buyer'} gets an SMS receipt with the amount and the balance left.</p>
                    <p className="text-xs text-muted">A saved payment can&apos;t be edited. A mistake is fixed with a correction, which keeps both on record.</p>
                    <div className="flex justify-end"><button className="btn btn-primary">Save and send receipt</button></div>
                  </form>
                </Popup>
              )}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-label">
                  <th className="py-2 pr-2">Payment</th><th className="py-2 pr-2">Due</th><th className="py-2 pr-2 text-right">Amount</th><th className="py-2 pr-2 text-right">Paid</th><th className="py-2">Status</th>
                </tr></thead>
                <tbody>
                  {d.schedule.map((s) => (
                    <tr key={s.seq} className="border-b border-line last:border-0">
                      <td className="py-2 pr-2">{s.seq === 0 ? (d.kind === 'cash' ? 'Full price' : 'Deposit') : s.seq}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{longDate(s.dueOn)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatUgx(s.amountUgx)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{s.paidUgx ? formatUgx(s.paidUgx) : ''}</td>
                      <td className="py-2"><Pill state={s.status} text={s.status === 'late' ? `${s.paidUgx ? 'Part paid, ' : ''}${s.daysLate} days late` : undefined} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="space-y-4">
            <section aria-labelledby="bal-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
              <h2 id="bal-h" className="font-display text-lg font-bold">Balance</h2>
              <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{formatUgx(d.balanceUgx)} <span className="text-sm font-semibold text-muted">{d.balanceUgx ? 'still owed' : 'paid in full'}</span></p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-soft-3" role="progressbar" aria-label="Paid so far" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((d.paidUgx / d.priceUgx) * 100)}>
                <div className="h-full rounded-full bg-primary-container" style={{ width: `${Math.min(100, (d.paidUgx / d.priceUgx) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{formatUgx(d.paidUgx)} paid of {formatUgx(d.priceUgx)} ({Math.round((d.paidUgx / d.priceUgx) * 100)}%)</p>
              <dl className="mt-3 divide-y divide-line text-sm">
                <div className="flex justify-between py-1.5"><dt>Price</dt><dd className="font-bold tabular-nums">{d.priceUgx.toLocaleString('en-US')}</dd></div>
                {d.kind === 'instalments' && <div className="flex justify-between py-1.5"><dt>Deposit</dt><dd className="font-bold tabular-nums">{d.depositUgx.toLocaleString('en-US')}</dd></div>}
                {d.kind === 'instalments' && <div className="flex justify-between py-1.5"><dt>Monthly</dt><dd className="font-bold tabular-nums">{(d.schedule.find((x) => x.seq === 1)?.amountUgx ?? 0).toLocaleString('en-US')} × {d.months}</dd></div>}
                {latePay.length > 0 && <div className="flex justify-between py-1.5"><dt>Late now</dt><dd className="font-bold tabular-nums text-bad-text">{full(d.lateUgx)}</dd></div>}
                {d.kind === 'instalments' && <div className="flex justify-between py-1.5"><dt>Reminders by SMS</dt><dd className="font-semibold">{d.reminders ? 'On' : 'Off'}</dd></div>}
              </dl>
              {d.kind === 'instalments' && <p className="mt-2 text-xs text-muted">On the car&apos;s SAZO report: <b>&ldquo;Balance still owed to a dealer: {d.balanceUgx ? 'yes' : 'no'}&rdquo;</b>. No amounts or names.</p>}
            </section>

            <section aria-labelledby="rec-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
              <h2 id="rec-h" className="font-display text-lg font-bold">Payments received</h2>
              {d.payments.length === 0 ? <p className="mt-2 text-sm text-muted">None yet.</p> : (
                <ul className="mt-1 divide-y divide-line">
                  {d.payments.map((p) => (
                    <li key={p.id} className="py-2.5 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className={p.corrected ? 'text-muted line-through' : ''}>
                          <span className="font-bold tabular-nums">{p.amountUgx.toLocaleString('en-US')}</span> · {METHOD[p.method] ?? p.method}
                          <span className="block text-xs text-muted no-underline">{shortDate(p.paidOn)} · Receipt {p.receiptNo}{p.reference ? ` · ${p.reference}` : ''}</span>
                          {p.note && <span className="block text-xs text-muted">{p.note}</span>}
                        </div>
                        <Link href={`${base}?plan=${d.planId}&receipt=${p.id}`} className="link shrink-0 text-xs">Receipt</Link>
                      </div>
                      {p.method !== 'correction' && !p.corrected && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-semibold text-muted">Correct this payment</summary>
                          <form action={correctPayment} className="mt-2 flex gap-2">
                            <input type="hidden" name="org" value={id} /><input type="hidden" name="plan" value={d.planId} /><input type="hidden" name="payment" value={p.id} />
                            <label htmlFor={`why-${p.id}`} className="sr-only">Why is it being corrected?</label>
                            <input id={`why-${p.id}`} name="reason" required minLength={3} placeholder="Why? e.g. typed the wrong amount" className="field !min-h-10 text-sm" />
                            <button className="btn btn-ghost !min-h-10 shrink-0 text-sm">Correct</button>
                          </form>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </>,
    );
  }

  const s = list.summary;
  return frame(
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Payments</h1>
        <p className="mt-1 max-w-2xl text-muted">Cars sold for cash or on instalments, and what is still owed. Records only: no money moves through SAZO.</p>
      </div>
      {notices}
      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-3">
        <DashCard href={`${base}?show=owing`} icon="savings" label="Still owed to you" value={formatUgx(s.owedUgx)} sub={`${s.owingSales} ${s.owingSales === 1 ? 'sale' : 'sales'}`} />
        <DashCard href={`${base}?show=due`} icon="calendar_month" label="Due in the next 7 days" value={formatUgx(s.dueSoonUgx)} sub={plural(s.dueSoonBuyers, 'buyer')} tone="lime" />
        <DashCard href={`${base}?show=late`} icon="warning" label="Late" value={formatUgx(s.lateUgx)} sub={`${s.lateBuyers} ${s.lateBuyers === 1 ? 'buyer' : 'buyers'}`} tone={s.lateBuyers ? 'bad' : undefined} />
      </section>

      <section aria-labelledby="sales-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="sales-h" className="font-display text-lg font-bold">Sales with payments</h2>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Show" className="flex flex-wrap rounded-lg bg-soft p-1 text-sm font-semibold">
              {FILTERS.map(([k, label]) => (
                <Link key={k} href={query({ show: k })} aria-current={show === k ? 'true' : undefined}
                  className={`rounded-md px-3 py-1 ${show === k ? 'bg-card text-primary-container shadow-sm' : 'text-muted'}`}>{label}</Link>
              ))}
            </nav>
            <details className="relative">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-lg border border-line bg-card px-3 text-sm font-semibold">
                Sort by: {SORTS.find(([k]) => k === sort)![1]}<Icon name="keyboard_arrow_down" size={16} />
              </summary>
              <nav aria-label="Sort by" className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-line bg-card p-1 shadow-xl">
                {SORTS.map(([k, label]) => (
                  <Link key={k} href={query({ sort: k })} aria-current={sort === k ? 'true' : undefined}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold ${sort === k ? 'bg-soft text-primary-container' : 'text-ink hover:bg-soft'}`}>
                    {label}{sort === k && <Icon name="check" size={16} />}
                  </Link>
                ))}
              </nav>
            </details>
          </div>
        </div>
        {show === 'due' && (
          <nav aria-label="Due within" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-muted">Due within</span>
            {WITHIN.map((w) => (
              <Link key={w} href={query({ within: w })} aria-current={within === w ? 'true' : undefined}
                className={`rounded-full border-2 px-3 py-1 font-semibold ${within === w ? 'border-primary-container bg-soft text-primary-container' : 'border-line text-ink'}`}>{w} days</Link>
            ))}
          </nav>
        )}
        {list.items.length === 0 ? <p className="mt-3 text-sm text-muted">{show === 'due' ? `Nothing due in the next ${within} days.` : 'Nothing here.'}</p> : (
          <>
            <div aria-hidden className="mt-3 hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_10rem_8rem_1.25rem] gap-3 border-b border-line px-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-label md:grid">
              <span>Car and buyer</span><span>Next due</span><span className="text-right">Amount due</span><span>Status</span><span className="text-right">Balance</span><span />
            </div>
            <ul aria-label="Sales" className="divide-y divide-line">
              {list.items.map((i) => (
                <li key={i.planId}>
                  <Link href={`${base}?plan=${i.planId}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 hover:bg-soft md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_10rem_8rem_1.25rem] md:px-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{carTitle(i.car)}</span>
                      <span className="block truncate text-xs text-muted">{i.buyer.name ?? 'Buyer'}{i.buyer.phone ? ` · ${localPhone(i.buyer.phone)}` : ''}</span>
                    </span>
                    <span className="hidden min-w-0 text-sm md:block">
                      {i.next ? <>{longDate(i.next.dueOn)}<span className="block text-xs text-muted">{i.next.seq === 0 ? (i.kind === 'cash' ? 'full price' : 'deposit') : `payment ${i.next.seq} of ${i.months}`}</span></> : <span className="text-muted">Nothing more due</span>}
                    </span>
                    <span className="hidden text-right font-bold tabular-nums md:block">
                      {i.next ? i.next.owingUgx.toLocaleString('en-US') : ''}
                    </span>
                    <span className="col-start-2 row-start-1 text-right md:col-auto md:row-auto md:text-left">
                      {i.state === 'paid' ? <Pill state="paid" text="Paid in full" />
                        : <Pill state={i.state === 'late' ? 'late' : i.next && i.next.daysUntil <= 7 ? 'due_soon' : 'coming'} text={whenText(i)} />}
                      <span className="block text-xs text-muted md:hidden">{i.next ? `${formatUgx(i.next.owingUgx)} due ${shortDate(i.next.dueOn)}` : ''}</span>
                    </span>
                    <span className="hidden text-right tabular-nums md:block">{i.balanceUgx ? i.balanceUgx.toLocaleString('en-US') : 'Paid'}</span>
                    <Icon name="chevron_right" size={20} className="hidden shrink-0 text-label md:block" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {list.unplanned.length > 0 && (
        <section aria-labelledby="unplanned-h" className="rounded-[14px] border border-line bg-card p-4 md:p-5">
          <h2 id="unplanned-h" className="font-display text-lg font-bold">Sold, payment not recorded yet</h2>
          <ul className="mt-1 divide-y divide-line">
            {list.unplanned.map((u) => (
              <li key={u.car.stockId}>
                <Link href={`${base}?add=${u.car.stockId}`} className="flex items-center gap-3 py-3 hover:bg-soft sm:px-2">
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{carTitle(u.car)}</span><span className="block text-xs text-muted">Sold {longDate(u.soldOn)} for {formatUgx(u.salePriceUgx)}</span></span>
                  <span className="shrink-0 text-sm font-semibold text-primary-container">Add how it is paid</span>
                  <Icon name="chevron_right" size={20} className="shrink-0 text-label" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>,
  );
}
