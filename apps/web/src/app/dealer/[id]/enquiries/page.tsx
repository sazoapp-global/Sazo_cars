import { Flash } from '@/components/flash';
import { formatDate, formatUgx } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { AppFrame } from '@/components/app-frame/app-frame';
import { NumberStrip } from '@/components/number-strip';
import { Pager, pageHref, paginate } from '@/components/pager';
import { api, isSignedIn } from '@/lib/api';
import { localPhone } from '@/lib/phone';
import type { Me, MyOrganisation, StockItem } from '@/lib/types';
import { addLead, decideLead, moveLead, noteLead } from '../../actions';
import { carName } from '../../labels';
import { BackButton } from '@/components/back-button';

export const metadata: Metadata = { title: 'Enquiries', robots: { index: false } };

interface Lead {
  leadId: string; stage: string; source: string; open: boolean; customer: { name: string | null; phone: string | null }; consentToContact: boolean; message: string | null;
  stockId: string | null; car: string | null; salePriceUgx: number | null; broker: string | null; addedBy: string | null; createdAt: string; updatedAt: string;
  splitBroker: { name: string; percent: number } | null; protectedUntil: string | null; needsDecision: boolean; earlier: { at: string; by: string; broker: boolean } | null;
}
interface LeadEvent { kind: string; fromStage: string | null; toStage: string | null; note: string | null; by: string | null; at: string }

const STAGES: [string, string][] = [['enquiry', 'New enquiry'], ['viewing', 'Viewing'], ['negotiation', 'Negotiating'], ['deposit', 'Deposit paid'], ['handover', 'Handover'], ['completed', 'Completed'], ['lost', 'Lost']];
const stageLabel = (s: string) => STAGES.find(([k]) => k === s)?.[1] ?? s;
/** The way an enquiry goes, in order (Lost sits apart). */
const FLOW = ['enquiry', 'viewing', 'negotiation', 'deposit', 'handover', 'completed'] as const;
const initials = (name: string | null) => (name ?? 'Customer').split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).slice(0, 2).join('');

/** The six stages as a line: done ones ticked, this one in lime, the rest waiting. */
function ProgressLine({ stage }: { stage: string }) {
  const at = stage === 'lost' ? -1 : FLOW.indexOf(stage as (typeof FLOW)[number]);
  return (
    <ol className="mt-5 grid grid-cols-3 gap-y-5 sm:grid-cols-6" aria-label="Stages">
      {FLOW.map((s, i) => (
        <li key={s} className="relative text-center" aria-current={i === at ? 'step' : undefined}>
          <span aria-hidden className={`absolute top-[15px] hidden h-1 sm:block ${i === 0 ? 'left-1/2' : 'left-0'} ${i === FLOW.length - 1 ? 'right-1/2' : 'right-0'} ${at >= 0 && i <= at ? 'bg-primary-container' : 'bg-line'}`} />
          <span className={`relative mx-auto grid size-8 place-items-center rounded-full font-extrabold ${i < at ? 'bg-primary-container text-white' : i === at ? 'border-[3px] border-primary-container bg-lime text-primary' : 'border-2 border-line bg-card text-muted'}`}>
            {i < at ? <Icon name="check" size={16} /> : i + 1}
          </span>
          <p className={`mt-2.5 leading-snug ${i === at ? 'font-extrabold text-primary' : 'font-semibold text-on-surface/70'}`}>{stageLabel(s)}</p>
        </li>
      ))}
    </ol>
  );
}
const SOURCES: [string, string][] = [['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['broker', 'A broker'], ['walk_in', 'Walked in'], ['phone_call', 'Phone call'], ['other', 'Other']];
const sourceLabel = (s: string) => SOURCES.find(([k]) => k === s)?.[1] ?? s;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SP = Promise<{ done?: string; error?: string; show?: string; open?: string; add?: string; page?: string; hp?: string }>;

export default async function Enquiries({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/enquiries`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.status !== 'approved') redirect(`/dealer/${id}`);
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

  const one = opened ? data.items.find((x) => x.leadId === opened) : undefined;
  if (one) {
    const l = one;
    return (
      <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role }} business={{ name: name, approved: true }}
        person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}>
        <p><BackButton href={`/dealer/${id}/enquiries${closed ? '?show=closed' : ''}`} /></p>
        {sp.done && <Flash className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</Flash>}
        {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
        {/* Option B (approved 4 Nov 2026): the customer at the top, the stages as a progress line, then what they
            asked and the history side by side, with room between the lines. */}
        <div className="space-y-5" role="region" aria-label={`Enquiry from ${l.customer.name ?? 'a customer'}`}>
          <section className="card flex flex-wrap items-center justify-between gap-5 p-5 md:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-primary-container font-display text-xl font-extrabold text-white">{initials(l.customer.name)}</span>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-extrabold leading-snug md:text-[26px]">{l.customer.name ?? 'Customer'}</h1>
                <p className="leading-relaxed text-muted">{[l.customer.phone ? localPhone(l.customer.phone) : null, l.car ?? 'No car chosen', `${sourceLabel(l.source)}${l.broker ? ` (${l.broker})` : ''}${l.addedBy ? `, added by ${l.addedBy}` : ''}`, formatDate(l.createdAt)].filter(Boolean).join(' · ')}</p>
                {l.broker && <p className="mt-1 leading-relaxed">Brought by broker {l.broker}{l.splitBroker ? `, shared with ${l.splitBroker.name} (${l.splitBroker.percent}%)` : ''}{l.protectedUntil && l.open ? `. Their customer until ${formatDate(l.protectedUntil)}` : ''}.</p>}
                {!l.consentToContact && <p className="mt-1 text-sm font-semibold text-warn-text">Did not agree to be contacted</p>}
              </div>
            </div>
            {l.customer.phone && (
              <div className="flex flex-wrap gap-2.5">
                <a href={`tel:${l.customer.phone}`} className="btn btn-primary"><Icon name="call" />Call</a>
                {l.consentToContact && <a href={`https://wa.me/${l.customer.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"><Icon name="chat" />WhatsApp</a>}
              </div>
            )}
          </section>

          {l.needsDecision && (
            <section className="rounded-[14px] border border-warn-line bg-warn-fill p-5">
              <p className="font-semibold leading-relaxed text-warn-text">Two claims on this customer. {l.earlier ? `${l.earlier.by} registered them first, on ${formatDate(l.earlier.at)}.` : ''} Commission is held until a manager decides.</p>
              {manager && (
                <form action={decideLead} data-draft={`lead-decide-${l.leadId}`} className="mt-3 grid gap-3 sm:grid-cols-2">{hidden}<input type="hidden" name="lead" value={l.leadId} />
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
            </section>
          )}

          <section aria-labelledby="progress-h" className="card p-5 md:p-6">
            <h2 id="progress-h" className="font-display text-lg font-bold">Progress</h2>
            <ProgressLine stage={l.stage} />
            {l.stage === 'completed' && <p className="mt-5 border-t border-line pt-4 font-semibold leading-relaxed text-ok-text">Sold{l.salePriceUgx ? ` for ${formatUgx(l.salePriceUgx, false)}` : ''}. The car is marked as sold.</p>}
            {l.stage === 'lost' && (
              <form action={moveLead} className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">{hidden}<input type="hidden" name="lead" value={l.leadId} /><input type="hidden" name="stage" value="enquiry" />
                <p className="font-semibold text-muted">This enquiry was lost.</p><button className="btn btn-ghost">Open it again</button>
              </form>
            )}
            {l.open && (() => {
              const i = FLOW.indexOf(l.stage as (typeof FLOW)[number]);
              const next = FLOW[i + 1];
              return (
                <div className="mt-5 space-y-4 border-t border-line pt-4">
                  <div className="flex flex-wrap items-end gap-2.5">
                    {next && (
                      <form action={moveLead} className="flex flex-wrap items-end gap-2.5">{hidden}<input type="hidden" name="lead" value={l.leadId} /><input type="hidden" name="stage" value={next} />
                        {next === 'completed' && <div><label htmlFor={`np-${l.leadId}`} className="label">Sold for (UGX)</label><input id={`np-${l.leadId}`} name="price" inputMode="numeric" required className="field tabular-nums" /></div>}
                        <button className="btn btn-primary">Move to {stageLabel(next)}</button>
                      </form>
                    )}
                    <form action={moveLead}>{hidden}<input type="hidden" name="lead" value={l.leadId} /><input type="hidden" name="stage" value="lost" />
                      <button className="btn btn-ghost text-bad-text">Mark as lost</button>
                    </form>
                  </div>
                  <details className="group">
                    <summary className="btn btn-ghost w-fit cursor-pointer list-none">Choose another stage</summary>
                    <form action={moveLead} data-draft={`lead-move-${l.leadId}`} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">{hidden}<input type="hidden" name="lead" value={l.leadId} />
                      <div><label htmlFor={`s-${l.leadId}`} className="label">Move to</label>
                        <select id={`s-${l.leadId}`} name="stage" className="field" defaultValue="">
                          <option value="" disabled>Choose</option>
                          {STAGES.filter(([k]) => k !== l.stage && k !== 'lost').map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}
                        </select></div>
                      <div><label htmlFor={`p-${l.leadId}`} className="label">Sold for (UGX, only for Completed)</label><input id={`p-${l.leadId}`} name="price" inputMode="numeric" className="field tabular-nums" /></div>
                      <button className="btn btn-ghost">Move</button>
                    </form>
                  </details>
                </div>
              );
            })()}
          </section>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section aria-labelledby="asked-h" className="card p-5 md:p-6">
              <h2 id="asked-h" className="font-display text-lg font-bold">What they asked</h2>
              {l.message
                ? <blockquote className="mt-4 rounded-r-xl border-l-4 border-lime bg-soft px-5 py-4 text-[17px] leading-relaxed">&ldquo;{l.message}&rdquo;</blockquote>
                : <p className="mt-3 text-muted">No message.</p>}
            </section>
            <section aria-labelledby="hist-h" className="card p-5 md:p-6">
              <h2 id="hist-h" className="font-display text-lg font-bold">History and notes</h2>
              <form action={noteLead} data-draft={`lead-note-${l.leadId}`} className="mt-4 flex gap-2.5">{hidden}<input type="hidden" name="lead" value={l.leadId} />
                <label htmlFor={`n-${l.leadId}`} className="sr-only">Note</label>
                <input id={`n-${l.leadId}`} name="note" required minLength={2} maxLength={500} className="field" placeholder="Add a note, for example: Called, coming Saturday" />
                <button className="btn btn-primary shrink-0">Save note</button>
              </form>
              {/* Newest first; a filled dot is something that happened, an open one a note. */}
              <ol className="ml-2 mt-6 space-y-5 border-l-2 border-line pl-6">
                {paginate([...events].reverse(), sp.hp).items.map((e, i) => (
                  <li key={i} className="relative leading-relaxed">
                    <span aria-hidden className={`absolute -left-[33px] top-1 size-4 rounded-full border-[3px] border-primary-container ${e.kind === 'note' ? 'bg-card' : 'bg-primary-container'}`} />
                    <p className="text-sm text-muted">{formatDate(e.at)}{e.by ? ` · ${e.by}` : ''}</p>
                    <p>{e.kind === 'note' ? e.note : <><strong>{e.kind === 'created' ? 'Enquiry received' : e.kind === 'stage' ? `Moved to ${stageLabel(e.toStage ?? '')}` : 'Note'}</strong>{e.note ? `. ${e.note}` : ''}</>}</p>
                  </li>
                ))}
              </ol>
              <Pager paged={paginate(events, sp.hp)} href={pageHref(`/dealer/${id}/enquiries`, { show: sp.show, open: sp.open }, 'hp')} noun="entries" label="Pages of the history" scroll={false} />
            </section>
          </div>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role }} business={{ name: name, approved: true }}
      person={me ? { name: me.displayName, role: org.role === 'org_manager' ? 'Manager' : 'Sales' } : undefined}>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">Enquiries</h1>
        <p className="mt-1 max-w-2xl text-muted">People who asked about your cars, from your shared links or added by your team. Only your business sees their names and numbers.</p>
      </div>
      {sp.done && <Flash className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</Flash>}
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
        <form action={addLead} data-draft={`lead-new-${id}`} className="mt-3 grid gap-3 sm:grid-cols-2">{hidden}
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
        <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card" aria-label="Enquiries">
          {paginate(data.items, sp.page).items.map((l) => (
            <li key={l.leadId}>
              <Link href={`/dealer/${id}/enquiries?${new URLSearchParams({ ...(closed ? { show: 'closed' } : {}), open: l.leadId })}`} className="flex items-center gap-3 px-4 py-3 hover:bg-soft">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l.customer.name ?? 'Customer'}{l.needsDecision && <span className="ml-2 chip border-warn-line bg-warn-fill text-warn-text">Needs a decision</span>}</span>
                  <span className="block truncate text-sm text-muted">{l.car ?? 'No car chosen'} · {sourceLabel(l.source)}{l.broker ? ` (${l.broker})` : ''} · {formatDate(l.createdAt)}</span>
                </span>
                <span className={`hidden shrink-0 text-sm font-semibold sm:block ${l.stage === 'completed' ? 'text-ok-text' : l.stage === 'lost' ? 'text-muted' : 'text-on-surface'}`}>{stageLabel(l.stage)}{l.salePriceUgx ? `, ${formatUgx(l.salePriceUgx)}` : ''}</span>
                <Icon name="chevron_right" size={20} className="shrink-0 text-label" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager paged={paginate(data.items, sp.page)} href={pageHref(`/dealer/${id}/enquiries`, { show: closed ? 'closed' : undefined })} noun="enquiries" />
    </AppFrame>
  );
}
