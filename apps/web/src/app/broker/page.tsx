import { KIND_LABELS, QUESTION_ORDER, QUESTION_TITLES, VEHICLE_KINDS, formatDate, formatKm, formatUgx, isVehicleKind, type VehicleKind } from '@sazo/contracts';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { PrintButton, ShareButtons } from '@/components/share-buttons';
import { statusIcon } from '@/components/status';
import { api, isSignedIn } from '@/lib/api';
import type { QuestionView, VehicleCard } from '@/lib/types';
import { applyBroker, brokerLink, stopBrokerLink } from './actions';
import { PICTURE_ACCEPT } from '@/lib/upload-types';

export const metadata: Metadata = { title: 'Brokers', robots: { index: false } };

interface BrokerCar {
  stockId: string; vehicleRef: string; vehicle: VehicleCard | null; specs: { make: string | null; model: string | null; year: number | null; engineCc: number | null; fuel: string | null; transmission: string | null; kind?: VehicleKind | null };
  askingPriceUgx: number; listedMileageKm: number | null; photos: string[]; commission: { kind: 'fixed'; amountUgx: number } | { kind: 'percent'; percent: number };
  dealer: { name: string; district: string | null }; questions: QuestionView[]; listedAt: string;
}
interface BrokerLink { linkId: string; channel: string; createdAt: string; stockId: string; live: boolean; car: string | null }
interface BrokerEnquiry { leadId: string; stage: string; createdAt: string; dealer: string | null; car: string | null; customer: { name: string | null; phone: string | null }; protectedUntil: string | null; waitingForDealerDecision: boolean; sharedWithAnotherBroker: boolean }
interface Commission { commissionId: string; status: string; amountUgx: number; sharePercent: number; dealer: string | null; car: string | null; paidReference: string | null; createdAt: string; updatedAt: string }

const CHANNELS: [string, string][] = [['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['other', 'Somewhere else']];
const STAGE: Record<string, string> = { enquiry: 'New enquiry', viewing: 'Viewing', negotiation: 'Negotiating', deposit: 'Deposit paid', handover: 'Handover', completed: 'Sold', lost: 'Lost' };
const PAY: Record<string, string> = { on_hold: 'Waiting for the dealer to decide', pending: 'Waiting for approval', approved: 'Approved, not paid yet', paid: 'Paid', cancelled: 'Cancelled' };
const TABS = [['cars', 'Cars to share', 'storefront'], ['links', 'My links', 'add_link'], ['enquiries', 'My customers', 'forum'], ['commissions', 'My commission', 'payments']] as const;
const name = (s: BrokerCar['specs']) => [s.year, s.make, s.model].filter(Boolean).join(' ') || 'Car';
const commissionText = (c: BrokerCar['commission']) => (c.kind === 'fixed' ? `${formatUgx(c.amountUgx, false)} commission` : `${c.percent}% of the selling price`);

type SP = Promise<{ tab?: string; done?: string; error?: string; link?: string; ch?: string; car?: string; kind?: string }>;

export default async function Broker({ searchParams }: { searchParams: SP }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/broker');
  const sp = await searchParams;
  const status = await api<{ isBroker: boolean; application: { status: string; decisionReason: string | null; createdAt: string } | null }>('/broker/application', { auth: true });
  const notice = <>
    {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
    {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
  </>;

  if (!status.isBroker) {
    const profile = await api<{ progress: { percent: number } }>('/me/profile', { auth: true });
    const a = status.application;
    return (
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 md:px-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Become a broker</h1>
          <p className="mt-2 text-muted">Share cars from approved dealers with your buyers. Customers who ask through your link are registered to you, and you can follow your commission here. Dealers set the commission for each car; SAZO keeps the record, it does not pay it.</p>
        </div>
        {notice}
        {a?.status === 'pending' ? (
          <p className="card p-4"><strong>SAZO is checking your ID.</strong> You applied on {formatDate(a.createdAt)}. You will see the result here.</p>
        ) : profile.progress.percent < 100 ? (
          <div className="card p-4">
            <p><strong>First, finish your profile</strong> ({profile.progress.percent}% done): your details, a confirmed phone and email, and a password.</p>
            <p className="mt-3"><Link href="/account" className="btn btn-primary">Finish your profile</Link></p>
          </div>
        ) : (
          <section className="card p-4 md:p-5" aria-labelledby="apply">
            {a?.status === 'rejected' && <p className="mb-3 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm text-warn-text">Your last application was not approved: {a.decisionReason}. You can apply again.</p>}
            <h2 id="apply" className="font-display text-lg font-bold">Your National ID</h2>
            <p className="mt-1 text-sm text-muted">A SAZO administrator checks that the ID matches your name. Your ID number is kept encrypted and is never shown to dealers or buyers.</p>
            <form action={applyBroker} className="mt-3 grid gap-3">
              <div><label htmlFor="nin" className="label">National ID number (NIN)</label><input id="nin" name="nin" required className="field sazo-id" autoCapitalize="characters" autoComplete="off" placeholder="CM12345678ABCD" /></div>
              <div><label htmlFor="idPhoto" className="label">Photo of your National ID</label>
                <input id="idPhoto" name="idPhoto" type="file" required accept={PICTURE_ACCEPT} capture="environment" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" /></div>
              <div><button className="btn btn-primary"><Icon name="badge" />Send for checking</button></div>
            </form>
          </section>
        )}
      </div>
    );
  }

  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'cars';
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const newLink = sp.link && /^[A-Za-z0-9_-]{20,40}$/.test(sp.link) ? `${origin}/c/${sp.link}` : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 md:px-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Broker</h1>
        <p className="mt-1 text-muted">Cars dealers have opened to brokers. Share them, and follow the customers you bring and your commission.</p>
      </div>
      <nav aria-label="Broker sections" className="flex flex-wrap gap-2">
        {TABS.map(([k, label, icon]) => (
          <Link key={k} href={`/broker?tab=${k}`} aria-current={tab === k ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold ${tab === k ? 'border-primary-container bg-primary-container text-white' : 'border-line-strong bg-white'}`}><Icon name={icon} size={16} />{label}</Link>
        ))}
      </nav>
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
      {tab === 'cars' && <Cars kind={isVehicleKind(sp.kind) ? sp.kind : undefined} />}
      {tab === 'links' && <Links />}
      {tab === 'enquiries' && <Enquiries />}
      {tab === 'commissions' && <Commissions />}
    </div>
  );
}

async function Cars({ kind }: { kind?: VehicleKind }) {
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
      {items.map((c) => {
        const qs = QUESTION_ORDER.map((k) => c.questions.find((q) => q.question === k)).filter((q): q is QuestionView => !!q);
        return (
          <li key={c.stockId} className="card overflow-hidden">
            {c.photos[0] ? <img src={`/broker/car/${c.stockId}/photo/${c.photos[0]}`} alt={`${name(c.specs)}, photo 1`} className="aspect-[4/3] w-full object-cover" />
              : <div className="flex aspect-[4/3] items-center justify-center bg-soft text-muted"><Icon name="directions_car" size={40} /></div>}
            <div className="space-y-2 p-4">
              <h2 className="font-display text-lg font-bold">{name(c.specs)}</h2>
              {c.specs.kind && <p className="text-sm font-semibold text-primary-container">{KIND_LABELS[c.specs.kind]}</p>}
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
    </>
  );
}

async function Links() {
  const { items } = await api<{ items: BrokerLink[] }>('/broker/links', { auth: true });
  if (!items.length) return <p className="text-muted">You have not made any links yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label="My links">
      {items.map((l) => (
        <li key={l.linkId} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <span><strong>{l.car ?? 'Car'}</strong>. {CHANNELS.find(([k]) => k === l.channel)?.[1]} link, made {formatDate(l.createdAt)}{l.live ? '' : '. The car is no longer for sale'}</span>
          <form action={stopBrokerLink}><input type="hidden" name="link" value={l.linkId} /><button className="link text-sm">Stop this link</button></form>
        </li>
      ))}
    </ul>
  );
}

async function Enquiries() {
  const { items } = await api<{ items: BrokerEnquiry[] }>('/broker/enquiries', { auth: true });
  if (!items.length) return <p className="text-muted">No customers yet. Share a car to bring some.</p>;
  return (
    <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label="My customers">
      {items.map((e) => (
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
  );
}

async function Commissions() {
  const s = await api<{ items: Commission[]; totals: { waiting: number; approved: number; paid: number } }>('/broker/commissions', { auth: true });
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
            <li key={c.commissionId} className="flex flex-wrap items-start justify-between gap-2 p-4 text-sm">
              <div><p className="font-bold">{c.car ?? 'Car'} at {c.dealer ?? 'a dealer'}</p>
                <p className="text-muted">{formatDate(c.createdAt)}{c.sharePercent < 100 ? `. Your share: ${c.sharePercent}%` : ''}{c.paidReference ? `. Reference: ${c.paidReference}` : ''}</p></div>
              <div className="sm:text-right"><p className="font-display text-lg font-extrabold tabular-nums">{formatUgx(c.amountUgx, false)}</p><p className="text-muted">{PAY[c.status] ?? c.status}</p></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
