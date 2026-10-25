import { formatDate } from '@sazo/contracts';
import { api } from '@/lib/api';
import type { Organisation } from '@/lib/types';
import { decideOrganisation } from '../actions';
import { Back, PersonLink, PersonView, Row, Rows, withQuery } from '../rows';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

const STATUSES = [['pending_verification', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['suspended', 'Suspended']] as const;
interface Manager { userId: string; name: string; identity: 'approved' | 'pending' | 'missing'; nin?: string; idPhotoEvidenceId?: string }
const ID_STATE: Record<Manager['identity'], [string, string]> = {
  approved: ['ID checked', 'text-ok-text'], pending: ['ID sent: check it before approving', 'text-warn-text'], missing: ['No National ID sent (optional)', 'text-muted'],
};
const TYPE: Record<string, string> = { garage: 'Garage', dealer: 'Dealer', inspector: 'Inspector', inspection_centre: 'Inspection centre', lender: 'Lender', insurer: 'Insurer', auction: 'Auction', rental: 'Rental', importer: 'Importer' };

export default async function Organisations({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/organisations');
  const sp = await searchParams;
  const status = sp.status ?? 'pending_verification';
  const data = await adminFetch<{ items: Organisation[] }>(`/admin/organisations?status=${status}`);
  const docs = new Map(data === 'forbidden' ? [] : await Promise.all(data.items.map(async (o) =>
    [o.id, (await api<{ evidenceIds: string[] }>(`/admin/organisations/${o.id}/documents`, { auth: true }).catch(() => ({ evidenceIds: [] }))).evidenceIds] as const)));
  const managers = new Map(data === 'forbidden' ? [] : await Promise.all(data.items.map(async (o) =>
    [o.id, (await api<{ items: Manager[] }>(`/admin/organisations/${o.id}/managers`, { auth: true }).catch(() => ({ items: [] as Manager[] }))).items] as const)));
  const path = '/admin/organisations';
  const q = { status: sp.status, item: sp.item };
  if (sp.person) return <PersonView userId={sp.person} back={withQuery(path, q, {})} backLabel="Back to the business" />;
  const one = data !== 'forbidden' && sp.item ? data.items.find((o) => o.id === sp.item) : undefined;
  if (one) {
    const o = one;
    return (
      <>
        <Back href={withQuery(path, q, { item: undefined })} label="All businesses" />
        <Notice done={sp.done} error={sp.error} />
        <section className="card p-4" aria-label="Details">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 id="org-h" className="font-display text-2xl font-bold">{o.tradingName ?? o.legalName}</h1>
            <span className="text-sm text-muted">{TYPE[o.type] ?? o.type} · registered {formatDate(o.createdAt)}</span>
          </div>
          <p className="text-sm">{[o.tradingName ? o.legalName : null, o.registrationNumber ? `Reg. no. ${o.registrationNumber}` : 'No registration number given', o.district ?? 'District not given'].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 text-sm">{(docs.get(o.id) ?? []).length === 0 ? <span className="text-warn-text">No documents sent yet.</span> : <>Documents: {(docs.get(o.id) ?? []).map((d, i) => <a key={d} className="link mr-2" href={`/admin/files/${d}`} target="_blank" rel="noreferrer">document {i + 1}</a>)}</>}</p>
          <h2 className="mt-3 text-sm font-bold">Managers</h2>
          <ul className="mt-1 space-y-1 text-sm" aria-label={`Managers of ${o.tradingName ?? o.legalName}`}>
            {(managers.get(o.id) ?? []).map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <PersonLink href={withQuery(path, q, { person: m.userId })} name={m.name} />
                <span className={ID_STATE[m.identity][1]}>{ID_STATE[m.identity][0]}</span>
                {m.nin && <span className="sazo-id">NIN {m.nin}</span>}
                {m.idPhotoEvidenceId && <a className="link" href={`/admin/files/${m.idPhotoEvidenceId}`} target="_blank" rel="noreferrer">ID photo</a>}
              </li>
            ))}
          </ul>
          <form action={decideOrganisation} className="mt-4 flex flex-col gap-2 md:flex-row md:items-end">
            <input type="hidden" name="id" value={o.id} />
            <div className="flex-1"><label htmlFor={`r-${o.id}`} className="label">Reason (kept in the audit log)</label>
              <input id={`r-${o.id}`} name="reason" required minLength={3} className="field" placeholder="e.g. Visited the workshop; trading licence checked" /></div>
            <div className="flex flex-wrap gap-2">
              {o.status !== 'approved' && <button name="decision" value="approve" className="btn btn-primary">Approve</button>}
              {o.status === 'pending_verification' && <button name="decision" value="request_info" className="btn btn-ghost">Ask for more</button>}
              {o.status === 'pending_verification' && <button name="decision" value="reject" className="btn btn-ghost">Reject</button>}
              {o.status === 'approved' && <button name="decision" value="suspend" className="btn btn-ghost">Suspend</button>}
            </div>
          </form>
        </section>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Businesses</h1>
      <p className="mb-4 text-muted">Check each business (registration, location, contact person) before it can record vehicle history. A manager&apos;s National ID is optional; when one was sent, check it too: approving the business also approves it.</p>
      <Notice done={sp.done} error={sp.error} />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map(([s, label]) => (
          <a key={s} href={`/admin/organisations?status=${s}`} aria-current={s === status ? 'true' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s === status ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-white'}`}>{label}</a>
        ))}
      </nav>
      {data === 'forbidden' ? <Forbidden what="approving businesses" /> : data.items.length === 0 ? <p className="text-muted">Nothing here.</p> : (
        <Rows label="Businesses">
          {data.items.map((o) => {
            const ms = managers.get(o.id) ?? [];
            const nDocs = (docs.get(o.id) ?? []).length;
            const idSent = ms.some((m) => m.identity === 'pending');
            return (
              <Row key={o.id} href={withQuery(path, { status: sp.status }, { item: o.id })} title={o.tradingName ?? o.legalName}
                meta={`${TYPE[o.type] ?? o.type} · ${o.district ?? 'District not given'} · registered ${formatDate(o.createdAt)} · ${ms.map((m) => m.name).join(', ') || 'no manager'}`}
                status={idSent ? 'ID sent: check it' : nDocs ? `${nDocs} ${nDocs === 1 ? 'document' : 'documents'}` : 'No documents yet'} tone={idSent ? 'warn' : nDocs ? 'ok' : 'muted'} />
            );
          })}
        </Rows>
      )}
    </>
  );
}
