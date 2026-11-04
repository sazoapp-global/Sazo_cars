// Alerts (D-153, approved 4 Nov 2026): what needs the dealer, worst first, beside the side bar. Choosing an alert opens
// its details beside the list: what is wrong, and where to fix it. Where the console can make the fix, it is right
// there and saves to the same place as the car, Payments or Enquiries page; the alert then goes away by itself.
// Red = act now, yellow = check soon, green "All clear" when there is nothing (D-111). On phones the list comes
// first and an alert opens in its place, with the way back.
import { formatDate, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { Icon } from '@/components/icon';
import { Pager, pageHref, paginate } from '@/components/pager';
import { api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation } from '@/lib/types';
import { changePrice, moveLead, noteLead, recordPayment, updateCar } from '../../actions';
import { dealerAlerts, type AlertTone, type DealerAlert } from '../../alerts';
import { CUSTOMS } from '../../labels';

export const metadata: Metadata = { title: 'Alerts', robots: { index: false } };

const TONE: Record<AlertTone | 'green', { card: string; bar: string; text: string; circle: string; dot: string; on: string; tag: string }> = {
  red: { card: 'border-bad-line', bar: 'border-l-bad-text', text: 'text-bad-text', circle: 'bg-bad-fill text-bad-text', dot: 'bg-bad-text', on: 'bg-bad-fill ring-2 ring-bad-text', tag: 'Act now' },
  yellow: { card: 'border-warn-line', bar: 'border-l-warn-text', text: 'text-warn-text', circle: 'bg-warn-fill text-warn-text', dot: 'bg-warn-text', on: 'bg-warn-fill ring-2 ring-warn-text', tag: 'Check soon' },
  green: { card: 'border-ok-line', bar: 'border-l-ok-text', text: 'text-ok-text', circle: 'bg-ok-fill text-ok-text', dot: 'bg-ok-text', on: '', tag: 'All clear' },
};
const Dot = ({ tone }: { tone: AlertTone | 'green' }) => <span aria-hidden className={`inline-block size-3 shrink-0 rounded-full ${TONE[tone].dot}`} />;
const METHODS: [string, string][] = [['mtn_momo', 'MTN MoMo'], ['airtel_money', 'Airtel Money'], ['bank', 'Bank'], ['cash', 'Cash']];
const LEAD_STAGES: [string, string][] = [['viewing', 'Viewing'], ['negotiation', 'Negotiating'], ['deposit', 'Deposit paid'], ['handover', 'Handover'], ['lost', 'Lost']];
/** Today in Kampala, for the payment date. */
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

interface PlanDetail {
  reminders: boolean;
  schedule: { seq: number; dueOn: string; amountUgx: number; paidUgx: number; owingUgx: number; status: string; daysLate: number }[];
}

type SP = Promise<{ alert?: string; done?: string; error?: string; page?: string }>;

export default async function DealerAlerts({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/alerts`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status === 'rejected' || org.status === 'suspended') redirect(`/dealer/${id}`);
  const approved = org.status === 'approved';
  const manager = org.role === 'org_manager';
  const name = org.tradingName ?? org.legalName;
  const [alerts, me] = await Promise.all([dealerAlerts(id, approved), api<Me>('/me', { auth: true }).catch(() => undefined)]);
  // Pages of 10, worst first across the pages (red ones come first on page 1).
  const paged = paginate(alerts, sp.page);
  const red = paged.items.filter((a) => a.tone === 'red');
  const yellow = paged.items.filter((a) => a.tone === 'yellow');
  const asked = alerts.find((a) => a.id === sp.alert);
  const open = asked ?? paged.items[0];
  const base = `/dealer/${id}/alerts`;
  const hrefOf = (a: DealerAlert) => `${base}?alert=${encodeURIComponent(a.id)}${paged.page > 1 ? `&page=${paged.page}` : ''}`;
  // A sale's instalment, for its alert: what was due and what is paid.
  const plan = open?.planId ? await api<PlanDetail>(`/dealer/payments/${open.planId}`, { auth: true, headers: { 'X-Organisation-Id': id } }).catch(() => undefined) : undefined;

  const group = (tone: AlertTone, label: string, list: DealerAlert[]) => list.length > 0 && (
    <section aria-labelledby={`${tone}-h`} className="space-y-2">
      <h2 id={`${tone}-h`} className="flex items-center gap-2 font-display text-lg font-bold"><Dot tone={tone} />{label}<span className="text-sm font-semibold text-muted">{list.length}</span></h2>
      <ul className="space-y-2">
        {list.map((a) => {
          const on = a.id === open?.id;
          return (
            <li key={a.id}>
              <Link href={hrefOf(a)} scroll={false} aria-current={on ? 'true' : undefined}
                className={`flex items-center gap-3 rounded-[14px] border border-l-[6px] p-3 shadow-sm ${TONE[tone].card} ${TONE[tone].bar} ${on ? TONE[tone].on : 'bg-card hover:bg-soft/60'}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${TONE[tone].circle}`}><Icon name={a.icon} size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-bold ${TONE[tone].text}`}>{a.title}</span>
                  <span className="block truncate text-sm text-on-surface">{[a.about, a.plate].filter(Boolean).join(' · ')}</span>
                </span>
                <Icon name="chevron_right" size={18} className="shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name, approved }}
      person={me ? { name: me.displayName, role: manager ? 'Manager' : 'Sales' } : undefined}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${asked ? 'max-lg:hidden' : ''}`}>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name}: alerts</h1>
          <p className="mt-1 max-w-3xl text-muted">Things in your business that need you, worst first. Choose one to see what is wrong and where to fix it. Each alert goes away by itself once it is dealt with.</p>
        </div>
        <p className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <span className="inline-flex items-center gap-1"><Dot tone="red" />Act now</span>
          <span className="inline-flex items-center gap-1"><Dot tone="yellow" />Check soon</span>
          <span className="inline-flex items-center gap-1"><Dot tone="green" />All clear</span>
        </p>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {alerts.length === 0 ? (
        <div role="status" className="flex items-center gap-4 rounded-[14px] border-2 border-ok-line bg-ok-fill p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-ok-text"><Icon name="check_circle" size={28} /></span>
          <div>
            <p className="font-display text-xl font-bold text-ok-text">All clear</p>
            <p className="text-on-surface">No serious findings, no bond deadlines close and nothing late. SAZO checks again whenever something changes.</p>
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className={`space-y-5 ${asked ? 'max-lg:hidden' : ''}`}>
            <div className="grid grid-cols-2 gap-3">
              {([['red', alerts.filter((a) => a.tone === 'red').length, 'Act now'], ['yellow', alerts.filter((a) => a.tone === 'yellow').length, 'Check soon']] as const).map(([tone, n, label]) => (
                <a key={tone} href={`#${tone}-h`} className={`flex items-center gap-3 rounded-[14px] border-2 p-3 ${tone === 'red' ? 'border-bad-line bg-bad-fill' : 'border-warn-line bg-warn-fill'}`}>
                  <span className={`font-display text-2xl font-extrabold tabular-nums ${TONE[tone].text}`}>{n}</span>
                  <span className={`font-semibold ${TONE[tone].text}`}>{label}</span>
                </a>
              ))}
            </div>
            {group('red', 'Act now', red)}
            {group('yellow', 'Check soon', yellow)}
            <Pager paged={paged} href={pageHref(base, {})} noun="alerts" scroll={false} />
          </div>
          {open && <div className={asked ? '' : 'max-lg:hidden'}><Detail a={open} org={id} base={base} back={hrefOf(open)} plan={plan} /></div>}
        </div>
      )}
    </AppFrame>
  );
}

/** One alert: what is wrong, and where to fix it. */
function Detail({ a, org, base, back, plan }: { a: DealerAlert; org: string; base: string; back: string; plan?: PlanDetail }) {
  const t = TONE[a.tone];
  const car = a.stockId ? `/dealer/${org}/car/${a.stockId}` : undefined;
  const hidden = (<><input type="hidden" name="org" value={org} /><input type="hidden" name="back" value={back} /></>);
  const facts = (rows: [string, string][]) => (
    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 text-sm">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
    </dl>
  );
  const h3 = (icon: Parameters<typeof Icon>[0]['name'], text: string) => <h3 className="mt-6 flex items-center gap-2 font-display text-base font-bold"><Icon name={icon} size={18} />{text}</h3>;
  const goesAway = (text = 'Once this is done the alert goes away by itself.') => <p className="mt-4 flex items-start gap-2 rounded-lg bg-soft p-3 text-sm text-on-surface"><Icon name="info" size={16} className="mt-0.5 shrink-0" />{text}</p>;
  const call = a.phone ? <a href={`tel:${a.phone}`} className="btn btn-ghost"><Icon name="call" size={18} />{a.buyer ? `Call ${a.buyer}` : 'Call'}</a> : null;

  // The instalment behind a payment alert.
  const row = plan && (a.kind === 'late' ? plan.schedule.find((s) => s.daysLate > 0 && s.owingUgx > 0) : plan.schedule.find((s) => s.owingUgx > 0));
  const payFacts: [string, string][] = row ? [
    ['Payment', row.seq === 0 ? 'Deposit' : `${row.seq} of ${plan!.schedule.filter((s) => s.seq > 0).length}`],
    ['Due', `${formatDate(row.dueOn)}${row.daysLate > 0 ? `, ${row.daysLate} ${row.daysLate === 1 ? 'day' : 'days'} late` : ''}`],
    ['Amount due', formatUgx(row.amountUgx, false)], ['Paid so far', formatUgx(row.paidUgx, false)], ['Still owed on it', formatUgx(row.owingUgx, false)],
    ['Reminders by SMS', plan!.reminders ? 'On' : 'Off'],
  ] : [];

  return (
    <section aria-labelledby="alert-h" className={`rounded-[16px] border-2 border-t-[6px] bg-card p-5 shadow-sm md:p-6 lg:sticky lg:top-16 ${t.card} ${a.tone === 'red' ? 'border-t-bad-text' : 'border-t-warn-text'}`}>
      <p className="mb-3 lg:hidden"><Link href={base} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />All alerts</Link></p>
      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide ${t.card} ${t.circle}`}>{t.tag}</span>
      <h2 id="alert-h" className={`mt-2 font-display text-2xl font-extrabold ${t.text}`}>{a.title}</h2>
      <p className="mt-1 text-sm text-on-surface">{[a.about, a.plate].filter(Boolean).join(' · ')}</p>

      {h3('fact_check', 'What is wrong')}
      <p className="mt-2 text-on-surface">{a.what}</p>
      {a.findings?.map((f) => (
        <div key={f.question} className="mt-3 rounded-lg border border-bad-line bg-bad-fill/50 p-3">
          <p className="font-semibold text-bad-text">{f.question}: {f.ask} Serious</p>
          <p className="mt-1 text-on-surface">{f.line}</p>
        </div>
      ))}
      {facts([...a.facts.filter(([k]) => !(payFacts.length && k === 'Late now')), ...payFacts])}

      {a.kind === 'finding' && (
        <>
          {h3('report', 'Where to fix it')}
          <p className="mt-1 text-sm text-muted">This comes from other businesses’ records, so it cannot be changed from your console. What you can do:</p>
          <ol className="mt-3 space-y-3">
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-soft font-bold text-primary-container">1</span>
              <div><p className="font-semibold">Check the car against its logbook</p><p className="text-sm text-muted">Match the chassis number, engine number and both plates.</p></div></li>
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-soft font-bold text-primary-container">2</span>
              <div><p className="font-semibold">See the records behind this finding</p><p className="text-sm"><Link href={`${car}?tab=report&view=records`} className="link">Open the records</Link> (they open here, in your console)</p></div></li>
            <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-soft font-bold text-primary-container">3</span>
              <div><p className="font-semibold">Tell buyers before they pay</p><p className="text-sm text-muted">Buyers already see the same finding on the car’s report.</p></div></li>
          </ol>
          {goesAway('This alert goes away when the records no longer show a serious finding, or when the car is sold or removed.')}
        </>
      )}

      {a.kind === 'bond' && a.bond && (
        <>
          {h3('inventory_2', 'Where to fix it: right here')}
          <p className="mt-1 text-sm text-muted">The same customs bond details as on the car. Saving here saves them on the car too.</p>
          <form action={updateCar} className="mt-3 grid gap-3 sm:grid-cols-2">{hidden}<input type="hidden" name="id" value={a.stockId} /><input type="hidden" name="at" value="bond" />
            <div><label htmlFor="al-status" className="label">Customs status</label>
              <select id="al-status" name="customsStatus" defaultValue={a.bond.status ?? ''} className="field"><option value="">Not given</option>{CUSTOMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label htmlFor="al-ext" className="label">Approved extension until</label><input id="al-ext" name="customsExtensionUntil" type="date" defaultValue={a.bond.extension ?? ''} className="field" /></div>
            <div><label htmlFor="al-deadline" className="label">Bond deadline</label><input id="al-deadline" name="customsDeadline" type="date" defaultValue={a.bond.deadline ?? ''} className="field" /></div>
            <div className="flex items-end"><button className="btn btn-primary w-full">Save</button></div>
          </form>
          <ul className="mt-3 space-y-1 text-sm text-on-surface"><li>Car released or tax paid? Change the customs status.</li><li>Customs gave you more time? Enter the extension.</li></ul>
          <p className="mt-3 text-sm"><Link href={`${car}#bond`} className="link">All the details of this car’s customs bond</Link></p>
          {goesAway()}
        </>
      )}

      {(a.kind === 'late' || a.kind === 'due') && (
        <>
          {h3('savings', 'Where to fix it: right here')}
          <p className="mt-1 text-sm text-muted">Paid already? Record it. It is added to this sale in Payments and the buyer gets a receipt by SMS.</p>
          <form action={recordPayment} className="mt-3 grid gap-3 sm:grid-cols-2">{hidden}<input type="hidden" name="plan" value={a.planId} />
            <div><label htmlFor="al-amount" className="label">Amount (UGX)</label><input id="al-amount" name="amount" inputMode="numeric" defaultValue={(row?.owingUgx ?? a.owingUgx ?? 0).toLocaleString('en-UG')} className="field tabular-nums" /></div>
            <div><label htmlFor="al-method" className="label">How was it paid?</label><select id="al-method" name="method" className="field">{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label htmlFor="al-date" className="label">Date</label><input id="al-date" name="paidOn" type="date" max={today()} defaultValue={today()} className="field" /></div>
            <div><label htmlFor="al-ref" className="label">Reference (optional)</label><input id="al-ref" name="reference" maxLength={80} placeholder="MoMo ID, bank slip" className="field" /></div>
            <div className="flex flex-wrap gap-2 sm:col-span-2"><button className="btn btn-primary">Record the payment</button>{call}</div>
          </form>
          <p className="mt-3 text-sm"><Link href={`/dealer/${org}/payments?plan=${a.planId}`} className="link">The whole instalment plan for this sale</Link></p>
          {goesAway(a.kind === 'late' ? 'Once the late amount is paid the alert goes away by itself.' : undefined)}
        </>
      )}

      {a.kind === 'age' && (
        <>
          {h3('sell', 'Where to fix it: right here')}
          <form action={changePrice} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">{hidden}<input type="hidden" name="id" value={a.stockId} />
            <div><label htmlFor="al-price" className="label">New asking price (UGX)</label><input id="al-price" name="price" inputMode="numeric" defaultValue={(a.priceUgx ?? 0).toLocaleString('en-UG')} className="field tabular-nums" /></div>
            <div className="flex items-end"><button className="btn btn-primary w-full">Change price</button></div>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`${car}#share`} className="btn btn-ghost"><Icon name="share" size={18} />Share the car again</Link>
            <Link href={car!} className="btn btn-ghost">Mark as sold</Link>
          </div>
          <p className="mt-3 text-sm">The levels are yours: <Link href={`/dealer/${org}#settings-section`} className="link">change them in Settings</Link>.</p>
          {goesAway(a.tone === 'red' ? 'This alert goes away when the car is sold or removed.' : 'This alert turns red after your last level, and goes away when the car is sold or removed.')}
        </>
      )}

      {a.kind === 'enquiry' && (
        <>
          {h3('forum', 'Where to fix it: right here')}
          <form action={moveLead} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">{hidden}<input type="hidden" name="lead" value={a.leadId} />
            <div><label htmlFor="al-stage" className="label">Move to</label><select id="al-stage" name="stage" className="field">{LEAD_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="flex items-end"><button className="btn btn-primary w-full">Move</button></div>
          </form>
          <form action={noteLead} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">{hidden}<input type="hidden" name="lead" value={a.leadId} />
            <div><label htmlFor="al-note" className="label">Note</label><input id="al-note" name="note" maxLength={500} placeholder="Called, coming Saturday" className="field" /></div>
            <div className="flex items-end"><button className="btn btn-ghost w-full">Save note</button></div>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-3">{call}<Link href={`/dealer/${org}/enquiries?open=${a.leadId}`} className="link text-sm">The whole enquiry</Link></div>
          {goesAway('Once you move the enquiry on from New enquiry the alert goes away by itself.')}
        </>
      )}
    </section>
  );
}
