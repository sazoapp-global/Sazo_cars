import { ConfirmButton } from '@/components/confirm-button';
import { Flash } from '@/components/flash';
import { CAR_CATEGORY_LABELS, type CarCategory, KIND_LABELS, QUESTION_ORDER, QUESTION_TITLES, VEHICLE_KINDS, formatDate, formatKm, formatUgx, isVehicleKind, type VehicleKind } from '@sazo/contracts';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Pager, pageHref, paginate } from '@/components/pager';
import { PrintButton, ShareButtons } from '@/components/share-buttons';
import { statusIcon } from '@/components/status';
import { AppFrame } from '@/components/app-frame/app-frame';
import { api, isSignedIn } from '@/lib/api';
import type { Me, QuestionView, VehicleCard } from '@/lib/types';
import { brokerLink, stopBrokerLink } from './actions';

export const metadata: Metadata = { title: 'Brokers', robots: { index: false } };

interface BrokerCar {
  stockId: string; vehicleRef: string; vehicle: VehicleCard | null; specs: { make: string | null; model: string | null; year: number | null; engineCc: number | null; fuel: string | null; transmission: string | null; kind?: VehicleKind | null; category?: CarCategory | null };
  askingPriceUgx: number; listedMileageKm: number | null; photos: string[]; commission: { kind: 'fixed'; amountUgx: number } | { kind: 'percent'; percent: number };
  dealer: { name: string; district: string | null }; questions: QuestionView[]; listedAt: string;
}
interface BrokerLink { linkId: string; channel: string; createdAt: string; stockId: string; live: boolean; car: string | null }
interface BrokerEnquiry { leadId: string; stage: string; createdAt: string; dealer: string | null; car: string | null; customer: { name: string | null; phone: string | null }; protectedUntil: string | null; waitingForDealerDecision: boolean; sharedWithAnotherBroker: boolean }
interface Commission { commissionId: string; status: string; amountUgx: number; sharePercent: number; dealer: string | null; car: string | null; paidReference: string | null; createdAt: string; updatedAt: string }

const CHANNELS: [string, string][] = [['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['other', 'Somewhere else']];
const STAGE: Record<string, string> = { enquiry: 'New enquiry', viewing: 'Viewing', negotiation: 'Negotiating', deposit: 'Deposit paid', handover: 'Handover', completed: 'Sold', lost: 'Lost' };
const PAY: Record<string, string> = { on_hold: 'Waiting for the dealer to decide', pending: 'Waiting for approval', approved: 'Approved, not paid yet', paid: 'Paid', cancelled: 'Cancelled' };
const TABS = [['cars', 'Cars to share'], ['links', 'My links'], ['enquiries', 'My customers'], ['commissions', 'My commission']] as const;
type Tab = (typeof TABS)[number][0];
/** One line under each page's title. */
const INTRO: Record<Tab, string> = {
  cars: 'Cars dealers have opened to brokers. Share them, and follow the customers you bring and your commission.',
  links: 'The links you made for cars. Stop one when you no longer want it used.',
  enquiries: 'Customers who came through your links, and where each one is.',
  commissions: 'What dealers owe you for the sales you brought.',
};
const name = (s: BrokerCar['specs']) => [s.year, s.make, s.model].filter(Boolean).join(' ') || 'Car';
const commissionText = (c: BrokerCar['commission']) => (c.kind === 'fixed' ? `${formatUgx(c.amountUgx, false)} commission` : `${c.percent}% of the selling price`);

type SP = Promise<{ tab?: string; done?: string; error?: string; link?: string; ch?: string; car?: string; kind?: string; page?: string }>;

export default async function Broker({ searchParams }: { searchParams: SP }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/broker');
  const sp = await searchParams;
  const status = await api<{ isBroker: boolean; application: { status: string; decisionReason: string | null; createdAt: string } | null }>('/broker/application', { auth: true });
  const notice = <>
    {sp.done && <Flash className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</Flash>}
    {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
  </>;

  // Not a broker yet (11 Nov 2026): the application has its own page, outside the broker workspace.
  if (!status.isBroker) redirect(`/become-a-broker${sp.done || sp.error ? `?${new URLSearchParams({ ...(sp.done ? { done: sp.done } : {}), ...(sp.error ? { error: sp.error } : {}) })}` : ''}`);

  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'cars';
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const newLink = sp.link && /^[A-Za-z0-9_-]{20,40}$/.test(sp.link) ? `${origin}/c/${sp.link}` : undefined;

  const me = await api<Me>('/me', { auth: true });
  const [, title] = TABS.find(([k]) => k === tab)!;
  return (
    // The broker's own workspace (11 Nov 2026): the four parts are side bar items, each with its own title.
    <AppFrame workspace="broker" viewer={{ platformRoles: me.platformRoles }} business={{ name: me.displayName, approved: true, badge: 'Approved broker' }}>
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted">{INTRO[tab]}</p>
      </div>
      {notice}
      {newLink && (
        <div className="rounded-lg border border-ok-line bg-ok-fill p-3" role="status">
          <p className="font-semibold text-ok-text">Your {CHANNELS.find(([k]) => k === sp.ch)?.[1] ?? ''} link is ready. Customers who ask through it are registered to you.</p>
          <p className="sazo-id mt-2 break-all rounded bg-white p-2 text-sm normal-case tracking-normal">{newLink}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="btn btn-primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`See this car, its photos and its SAZO history: ${newLink}`)}`}><Icon name="chat" />Send on WhatsApp</a>
            <ShareButtons url={newLink} title="Car for sale" />
          </div>
        </div>
      )}
      {tab === 'cars' && <Cars kind={isVehicleKind(sp.kind) ? sp.kind : undefined} page={sp.page} />}
      {tab === 'links' && <Links page={sp.page} />}
      {tab === 'enquiries' && <Enquiries page={sp.page} />}
      {tab === 'commissions' && <Commissions page={sp.page} />}
    </div>
    </AppFrame>
  );
}

async function Cars({ kind, page }: { kind?: VehicleKind; page?: string }) {
  const { items: all } = await api<{ items: BrokerCar[] }>('/broker/cars', { auth: true });
  if (!all.length) return <p className="rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">No cars are open to brokers right now.</p>;
  // D-148: filter by the kind of car.
  const kinds = VEHICLE_KINDS.filter((k) => all.some((c) => c.specs.kind === k));
  const items = kind ? all.filter((c) => c.specs.kind === kind) : all;
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white'}`;
  return (
    <>
    {kinds.length > 1 && (
      <nav aria-label="Kind of car" className="flex flex-wrap gap-2">
        <Link href="/broker?tab=cars" aria-current={!kind ? 'page' : undefined} className={chip(!kind)}>All kinds</Link>
        {kinds.map((k) => <Link key={k} href={`/broker?tab=cars&kind=${k}`} aria-current={kind === k ? 'page' : undefined} className={chip(kind === k)}>{KIND_LABELS[k]}</Link>)}
      </nav>
    )}
    {!items.length && <p className="text-muted">No cars of this kind right now.</p>}
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Cars to share">
      {paginate(items, page).items.map((c) => {
        const qs = QUESTION_ORDER.map((k) => c.questions.find((q) => q.question === k)).filter((q): q is QuestionView => !!q);
        return (
          <li key={c.stockId} className="card overflow-hidden">
            {c.photos[0] ? <img src={`/broker/car/${c.stockId}/photo/${c.photos[0]}`} alt={`${name(c.specs)}, photo 1`} className="aspect-[4/3] w-full object-cover" />
              : <div className="flex aspect-[4/3] items-center justify-center bg-soft text-muted"><Icon name="directions_car" size={40} /></div>}
            <div className="space-y-2 p-4">
              <h2 className="font-display text-lg font-bold">{name(c.specs)}</h2>
              {(c.specs.category || c.specs.kind) && <p className="text-sm font-semibold text-primary-container">{[c.specs.category && CAR_CATEGORY_LABELS[c.specs.category], c.specs.kind && KIND_LABELS[c.specs.kind]].filter(Boolean).join(' · ')}</p>}
              <p className="font-display text-xl font-extrabold tabular-nums">{formatUgx(c.askingPriceUgx, false)}</p>
              <p className="text-sm text-muted">{c.dealer.name}{c.dealer.district ? `, ${c.dealer.district}` : ''}{c.listedMileageKm !== null ? `. ${formatKm(c.listedMileageKm)}` : ''}</p>
              <p className="chip w-fit border-lime bg-lime/30 text-ink"><Icon name="payments" size={14} />{commissionText(c.commission)}</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="What SAZO records show">
                {qs.map((q) => { const st = statusIcon(q.status); return <li key={q.question} className={`flex items-center gap-1 font-semibold ${st.cls}`}><Icon name={st.icon} size={14} />{QUESTION_TITLES[q.question]?.short}</li>; })}
              </ul>
              <form action={brokerLink} className="flex gap-2">
                <input type="hidden" name="stock" value={c.stockId} />
                <label htmlFor={`ch-${c.stockId}`} className="sr-only">Where will you share {name(c.specs)}?</label>
                <select id={`ch-${c.stockId}`} name="channel" className="field !min-h-11" defaultValue="whatsapp">{CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <button className="btn btn-primary !min-h-11 shrink-0"><Icon name="add_link" />Make my link</button>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
    <Pager paged={paginate(items, page)} href={pageHref('/broker', { tab: 'cars', kind })} noun="cars" />
    </>
  );
}

async function Links({ page }: { page?: string }) {
  const { items } = await api<{ items: BrokerLink[] }>('/broker/links', { auth: true });
  if (!items.length) return <p className="text-muted">You have not made any links yet.</p>;
  return (
    <>
    <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label="My links">
      {paginate(items, page).items.map((l) => (
        <li key={l.linkId} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <span><strong>{l.car ?? 'Car'}</strong>. {CHANNELS.find(([k]) => k === l.channel)?.[1]} link, made {formatDate(l.createdAt)}{l.live ? '' : '. The car is no longer for sale'}</span>
          <form action={stopBrokerLink}><input type="hidden" name="link" value={l.linkId} /><ConfirmButton className="link text-sm" icon="link_off"
            title="Stop this link?" text="Buyers who open it will see it has stopped." confirm="Stop link" keep="Keep the link">Stop this link</ConfirmButton></form>
        </li>
      ))}
    </ul>
    <Pager paged={paginate(items, page)} href={pageHref('/broker', { tab: 'links' })} noun="links" />
    </>
  );
}

async function Enquiries({ page }: { page?: string }) {
  const { items } = await api<{ items: BrokerEnquiry[] }>('/broker/enquiries', { auth: true });
  if (!items.length) return <p className="text-muted">No customers yet. Share a car to bring some.</p>;
  return (
    <>
    <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label="My customers">
      {paginate(items, page).items.map((e) => (
        <li key={e.leadId} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold">{e.customer.name ?? 'Customer'} <span className="font-normal text-muted">{e.customer.phone}</span></p>
              <p className="text-sm text-muted">{e.car ?? 'Car'} at {e.dealer ?? 'a dealer'}. {formatDate(e.createdAt)}</p>
              {e.protectedUntil && <p className="text-sm">Registered to you until {formatDate(e.protectedUntil)}.</p>}
              {e.waitingForDealerDecision && <p className="text-sm font-semibold text-warn-text">Someone else also registered this customer. The dealer will decide.</p>}
              {e.sharedWithAnotherBroker && <p className="text-sm">The dealer decided you share this customer with another broker.</p>}
            </div>
            <span className="chip border-line-strong bg-white text-on-surface">{STAGE[e.stage] ?? e.stage}</span>
          </div>
        </li>
      ))}
    </ul>
    <Pager paged={paginate(items, page)} href={pageHref('/broker', { tab: 'enquiries' })} noun="customers" />
    </>
  );
}

async function Commissions({ page }: { page?: string }) {
  const s = await api<{ items: Commission[]; totals: { waiting: number; approved: number; paid: number } }>('/broker/commissions', { auth: true });
  const shown = paginate(s.items, page);
  return (
    <section aria-labelledby="statement" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="statement" className="font-display text-lg font-bold">Commission statement</h2>
        <PrintButton />
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[['Waiting', s.totals.waiting], ['Approved, not paid', s.totals.approved], ['Paid', s.totals.paid]].map(([l, v]) => (
          <div key={l as string} className="card p-3"><dt className="text-[11px] font-bold uppercase tracking-wider text-label">{l}</dt><dd className="font-display text-xl font-extrabold tabular-nums">{formatUgx(v as number, false)}</dd></div>
        ))}
      </dl>
      <p className="text-sm text-muted">SAZO records what dealers say they owe and have paid. Payment is between you and the dealer.</p>
      {s.items.length === 0 ? <p className="text-muted">No commission yet.</p> : (
        <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label="Commissions">
          {s.items.map((c) => (
            // On screen one page of 10; a printed statement keeps every line.
            <li key={c.commissionId} className={`flex-wrap items-start justify-between gap-2 p-4 text-sm ${shown.items.includes(c) ? 'flex' : `hidden print:flex`}`}>
              <div><p className="font-bold">{c.car ?? 'Car'} at {c.dealer ?? 'a dealer'}</p>
                <p className="text-muted">{formatDate(c.createdAt)}{c.sharePercent < 100 ? `. Your share: ${c.sharePercent}%` : ''}{c.paidReference ? `. Reference: ${c.paidReference}` : ''}</p></div>
              <div className="sm:text-right"><p className="font-display text-lg font-extrabold tabular-nums">{formatUgx(c.amountUgx, false)}</p><p className="text-muted">{PAY[c.status] ?? c.status}</p></div>
            </li>
          ))}
        </ul>
      )}
      <Pager paged={shown} href={pageHref('/broker', { tab: 'commissions' })} noun="commissions" />
    </section>
  );
}
