import { formatDate, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { NumberStrip, WorkspaceFrame } from '@/components/workspace-frame';
import { api, isSignedIn } from '@/lib/api';
import type { Me, MyOrganisation, StockItem } from '@/lib/types';
import { addLead, decideLead, moveLead, noteLead } from '../../actions';
import { carName } from '../../labels';

export const metadata: Metadata = { title: 'Enquiries', robots: { index: false } };

interface Lead {
  leadId: string; stage: string; source: string; open: boolean; customer: { name: string | null; phone: string | null }; consentToContact: boolean; message: string | null;
  stockId: string | null; car: string | null; salePriceUgx: number | null; broker: string | null; addedBy: string | null; createdAt: string; updatedAt: string;
  splitBroker: { name: string; percent: number } | null; protectedUntil: string | null; needsDecision: boolean; earlier: { at: string; by: string; broker: boolean } | null;
}
interface LeadEvent { kind: string; fromStage: string | null; toStage: string | null; note: string | null; by: string | null; at: string }

const STAGES: [string, string][] = [['enquiry', 'New enquiry'], ['viewing', 'Viewing'], ['negotiation', 'Negotiating'], ['deposit', 'Deposit paid'], ['handover', 'Handover'], ['completed', 'Completed'], ['lost', 'Lost']];
const stageLabel = (s: string) => STAGES.find(([k]) => k === s)?.[1] ?? s;
const SOURCES: [string, string][] = [['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['broker', 'A broker'], ['walk_in', 'Walked in'], ['phone_call', 'Phone call'], ['other', 'Other']];
const sourceLabel = (s: string) => SOURCES.find(([k]) => k === s)?.[1] ?? s;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SP = Promise<{ done?: string; error?: string; show?: string; open?: string; add?: string }>;

export default async function Enquiries({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/enquiries`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer' || org.status !== 'approved') notFound();
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const closed = sp.show === 'closed';
  const [data, cars, me] = await Promise.all([
    api<{ items: Lead[]; thisMonthBySource: { source: string; enquiries: number; completed: number }[] }>(`/dealer/leads?stage=${closed ? 'closed' : 'open'}`, as),
    api<{ items: StockItem[] }>('/dealer/stock?status=in_stock', as).then((r) => r.items),
    api<Me>('/me', { auth: true }).catch(() => undefined),
  ]);
  const opened = sp.open && UUID.test(sp.open) ? sp.open : undefined;
  const events = opened ? await api<{ items: LeadEvent[] }>(`/dealer/leads/${opened}/events`, as).then((r) => r.items).catch(() => []) : [];
  const name = org.tradingName ?? org.legalName;
  const byStage = (s: string) => data.items.filter((l) => l.stage === s).length;
  const month = data.thisMonthBySource;
  const hidden = <input type="hidden" name="org" value={id} />;
  const manager = org.role === 'org_manager';

  return (
    <WorkspaceFrame kind="Dealer" name={name} approved
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}
      items={[
        { href: `/dealer/${id}`, label: 'For sale', icon: 'storefront', count: cars.length },
        { href: `/dealer/${id}/enquiries`, label: 'Enquiries', icon: 'forum', active: true },
        ...(manager ? [{ href: `/dealer/${id}/commissions`, label: 'Commission', icon: 'payments' as const }] : []),
        { href: `/dealer/${id}?show=sold`, label: 'Sold', icon: 'sell' },
        { href: `/business/${id}`, label: 'Business details', icon: 'verified_user' as const },
      ]}>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Enquiries</h1>
        <p className="mt-1 max-w-2xl text-muted">People who asked about your cars, from your shared links or added by your team. Only your business sees their names and numbers.</p>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      {!closed && <NumberStrip cells={[
        { label: 'New', value: String(byStage('enquiry')) },
        { label: 'Viewing or negotiating', value: String(byStage('viewing') + byStage('negotiation')) },
        { label: 'Deposit or handover', value: String(byStage('deposit') + byStage('handover')) },
        { label: 'Sales this month', value: String(month.reduce((n, m) => n + m.completed, 0)), sub: (() => { const n = month.reduce((t, m) => t + m.enquiries, 0); return `${n} ${n === 1 ? 'enquiry' : 'enquiries'} this month`; })() },
      ]} />}

      {month.length > 0 && (
        <section className="rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="sources">
          <h2 id="sources" className="font-display text-lg font-bold">Where this month&apos;s enquiries came from</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {month.map((m) => <li key={m.source} className="flex justify-between gap-3 py-2"><span>{sourceLabel(m.source)}</span><span className="tabular-nums">{m.enquiries} {m.enquiries === 1 ? 'enquiry' : 'enquiries'}, <strong>{m.completed} {m.completed === 1 ? 'sale' : 'sales'}</strong></span></li>)}
          </ul>
        </section>
      )}

      <details className="rounded-[14px] border border-line bg-soft/50 p-4 md:p-5" open={sp.add === '1'}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-lg font-bold text-primary-container"><Icon name="add" />Add an enquiry</summary>
        <form action={addLead} className="mt-3 grid gap-3 sm:grid-cols-2">{hidden}
          <div><label htmlFor="lname" className="label">Customer&apos;s name</label><input id="lname" name="name" required className="field" /></div>
          <div><label htmlFor="lphone" className="label">Phone number</label><input id="lphone" name="phone" type="tel" required className="field" placeholder="0772 123 456" /></div>
          <div><label htmlFor="lcar" className="label">Car</label><select id="lcar" name="id" className="field" defaultValue=""><option value="">Not decided yet</option>
            {cars.map((c) => <option key={c.stockId} value={c.stockId}>{carName(c)}{c.vehicle?.currentPlate ? ` (${c.vehicle.currentPlate})` : ''}</option>)}</select></div>
          <div><label htmlFor="lsource" className="label">How did they find you?</label><select id="lsource" name="source" className="field" defaultValue="walk_in">
            {SOURCES.filter(([k]) => k !== 'broker').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="sm:col-span-2"><label htmlFor="lmessage" className="label">Note</label><input id="lmessage" name="message" maxLength={500} className="field" /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consent" defaultChecked className="size-5" />The customer agreed that we may contact them</label>
          <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="add" />Add</button></div>
        </form>
      </details>

      <nav aria-label="Show" className="flex w-fit overflow-hidden rounded-lg border border-line-strong text-sm font-semibold">
        <Link href={`/dealer/${id}/enquiries`} aria-current={!closed ? 'true' : undefined} className={`px-3 py-2 ${!closed ? 'bg-primary-container text-white' : 'bg-white hover:bg-soft'}`}>Open</Link>
        <Link href={`/dealer/${id}/enquiries?show=closed`} aria-current={closed ? 'true' : undefined} className={`border-l border-line-strong px-3 py-2 ${closed ? 'bg-primary-container text-white' : 'bg-white hover:bg-soft'}`}>Completed and lost</Link>
      </nav>

      {data.items.length === 0 ? <p className="rounded-[14px] border border-dashed border-line-strong p-6 text-center text-muted">{closed ? 'Nothing closed yet.' : 'No open enquiries. Share a car to get some.'}</p> : (
        <ul className="divide-y divide-line rounded-[14px] border border-line" aria-label="Enquiries">
          {data.items.map((l) => (
            <li key={l.leadId} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-base font-bold">{l.customer.name ?? 'Customer'}</p>
                  {l.customer.phone && <p className="text-sm"><a href={`tel:${l.customer.phone}`} className="link">{l.customer.phone}</a>
                    {l.consentToContact && <> · <a href={`https://wa.me/${l.customer.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="link">WhatsApp</a></>}</p>}
                  <p className="text-sm text-muted">{l.car ?? 'No car chosen'}. {sourceLabel(l.source)}{l.broker ? ` (${l.broker})` : ''}{l.addedBy ? `, added by ${l.addedBy}` : ''}. {formatDate(l.createdAt)}</p>
                  {l.broker && <p className="mt-1 text-sm">Brought by broker {l.broker}{l.splitBroker ? `, shared with ${l.splitBroker.name} (${l.splitBroker.percent}%)` : ''}{l.protectedUntil && l.open ? `. Their customer until ${formatDate(l.protectedUntil)}` : ''}.</p>}
                  {l.message && <p className="mt-1 text-sm">&ldquo;{l.message}&rdquo;</p>}
                  {!l.consentToContact && <p className="mt-1 text-xs font-semibold text-warn-text">Did not agree to be contacted</p>}
                </div>
                <span className={`chip ${l.stage === 'completed' ? 'border-ok-line bg-ok-fill text-ok-text' : l.stage === 'lost' ? 'border-line bg-soft text-muted' : 'border-line-strong bg-white text-on-surface'}`}>{stageLabel(l.stage)}{l.salePriceUgx ? `, ${formatUgx(l.salePriceUgx)}` : ''}</span>
              </div>
              {l.needsDecision && (
                <div className="mt-3 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm">
                  <p className="font-semibold text-warn-text">Two claims on this customer. {l.earlier ? `${l.earlier.by} registered them first, on ${formatDate(l.earlier.at)}.` : ''} Commission is held until a manager decides.</p>
                  {manager && (
                    <form action={decideLead} className="mt-2 grid gap-2 sm:grid-cols-2">{hidden}<input type="hidden" name="lead" value={l.leadId} />
                      <div><label htmlFor={`o-${l.leadId}`} className="label">Who brought the customer?</label>
                        <select id={`o-${l.leadId}`} name="outcome" className="field" defaultValue="keep">
                          <option value="keep">{l.broker ?? 'This enquiry'}</option>
                          {l.earlier && <option value="earlier">{l.earlier.broker ? l.earlier.by : 'Our own customer from before'}</option>}
                          {l.earlier?.broker && l.broker && <option value="split">Both brokers share</option>}
                          <option value="dealer">Our own customer (no broker)</option>
                        </select></div>
                      <div><label htmlFor={`sp-${l.leadId}`} className="label">If shared, {l.broker ?? 'this broker'}&apos;s percent</label><input id={`sp-${l.leadId}`} name="split" inputMode="numeric" defaultValue="50" className="field tabular-nums" /></div>
                      <div className="sm:col-span-2"><label htmlFor={`dr-${l.leadId}`} className="label">Reason (kept on record)</label><input id={`dr-${l.leadId}`} name="reason" required minLength={3} className="field" /></div>
                      <div><button className="btn btn-primary">Decide</button></div>
                    </form>
                  )}
                </div>
              )}
              {(l.open || l.stage === 'lost') && (
                <form action={moveLead} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">{hidden}<input type="hidden" name="lead" value={l.leadId} />
                  <div><label htmlFor={`s-${l.leadId}`} className="label">Move to</label>
                    <select id={`s-${l.leadId}`} name="stage" className="field" defaultValue="">
                      <option value="" disabled>Choose</option>
                      {STAGES.filter(([k]) => k !== l.stage && (l.stage !== 'lost' || k === 'enquiry')).map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}
                    </select></div>
                  <div><label htmlFor={`p-${l.leadId}`} className="label">Sold for (UGX, only for Completed)</label><input id={`p-${l.leadId}`} name="price" inputMode="numeric" className="field tabular-nums" /></div>
                  <button className="btn btn-ghost">Move</button>
                </form>
              )}
              <p className="mt-2" id={`e-${l.leadId}`}>
                <Link className="link text-sm" href={opened === l.leadId ? `/dealer/${id}/enquiries${closed ? '?show=closed' : ''}`
                  : `/dealer/${id}/enquiries?${new URLSearchParams({ ...(closed ? { show: 'closed' } : {}), open: l.leadId })}#e-${l.leadId}`}>{opened === l.leadId ? 'Hide history' : 'History and notes'}</Link>
              </p>
              {opened === l.leadId && (
                  <div className="mt-2 space-y-2">
                    <ol className="space-y-1 text-sm">
                      {events.map((e, i) => <li key={i} className="text-muted">{formatDate(e.at)}: {e.kind === 'created' ? 'Enquiry received' : e.kind === 'stage' ? `Moved to ${stageLabel(e.toStage ?? '')}` : 'Note'}{e.note ? `. ${e.note}` : ''}{e.by ? ` (${e.by})` : ''}</li>)}
                    </ol>
                    <form action={noteLead} className="flex gap-2">{hidden}<input type="hidden" name="lead" value={l.leadId} />
                      <label htmlFor={`n-${l.leadId}`} className="sr-only">Note</label>
                      <input id={`n-${l.leadId}`} name="note" required minLength={2} maxLength={500} className="field !min-h-10 text-sm" placeholder="Called, coming Saturday" />
                      <button className="btn btn-ghost !min-h-10">Save note</button>
                    </form>
                  </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </WorkspaceFrame>
  );
}
