// The console's lists and details (approved 25 Oct 2026): every list shows one row per item, and clicking a row
// opens all its details in the space beside the side bar, with a link back to the list. People and cars open
// there too, instead of in a pop-up or on another page.
import Link from 'next/link';
import { Facts } from '@/components/popup';
import { Icon } from '@/components/icon';
import { api } from '@/lib/api';
import { clearAuthenticator, personDetails } from './person-actions';

export type Tone = 'ok' | 'warn' | 'bad' | 'muted';
const TONE: Record<Tone, string> = { ok: 'text-ok-text', warn: 'text-warn-text', bad: 'text-bad-text', muted: 'text-muted' };

/** A list of rows; each opens its item's details. */
export function Rows({ label, children }: { label: string; children: React.ReactNode }) {
  return <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card">{children}</ul>;
}

export function Row({ href, title, meta, status, tone = 'muted', aside }: { href: string; title: React.ReactNode; meta?: React.ReactNode; status?: string; tone?: Tone; aside?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-4 px-4 py-3 hover:bg-soft">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {meta && <span className="block truncate text-sm text-muted">{meta}</span>}
        </span>
        {status && <span className={`hidden shrink-0 text-sm font-semibold sm:block ${TONE[tone]}`}>{status}</span>}
        {aside}
        <Icon name="chevron_right" size={20} className="shrink-0 text-label" />
      </Link>
    </li>
  );
}

export function Back({ href, label }: { href: string; label: string }) {
  return <p><Link href={href} className="link inline-flex items-center gap-1 text-sm"><Icon name="arrow_back" size={16} />{label}</Link></p>;
}

/** Adds or replaces query values on a console address. */
export function withQuery(path: string, q: Record<string, string | undefined>, add: Record<string, string | undefined>) {
  const p = new URLSearchParams(Object.entries({ ...q, ...add }).filter(([k, v]) => v && !['done', 'error'].includes(k)) as [string, string][]);
  return p.size ? `${path}?${p}` : path;
}

const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff', partner_operator: 'Data entry' };
const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' };
const ID_STATUS: Record<string, string> = { pending: 'Sent, waiting for a check', approved: 'Checked', rejected: 'Rejected' };

/** A person's account, in the space beside the side bar (was a pop-up). The API audits the look. */
export async function PersonView({ userId, back, backLabel }: { userId: string; back: string; backLabel: string }) {
  const [p, me] = await Promise.all([personDetails(userId), api<{ id: string; platformRoles: string[] }>('/me', { auth: true }).catch(() => undefined)]);
  const canClear = !!me?.platformRoles.includes('sazo_admin') && me.id !== userId;
  return (
    <section aria-labelledby="person-h" className="space-y-4">
      <Back href={back} label={backLabel} />
      {!p ? <p>Could not load this account.</p> : (
        <>
          <h1 id="person-h" className="font-display text-2xl font-bold">{p.name}</h1>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card space-y-4 p-4">
              <Facts rows={[
                ['Phone', p.phone ?? 'Not given'],
                ['Email', p.email ? `${p.email}${p.emailVerified ? '' : ' (not confirmed)'}` : 'Not given'],
                ['Gender', p.gender === 'female' ? 'Female' : p.gender === 'male' ? 'Male' : 'Not given'],
                ['Account', p.status === 'active' ? 'Active' : p.status],
              ]} />
              <section aria-label="Businesses">
                <h2 className="text-sm font-bold">Businesses</h2>
                {p.businesses.length === 0 ? <p className="text-sm text-muted">None.</p> : (
                  <ul className="mt-1 divide-y divide-line text-sm">
                    {p.businesses.map((b) => (
                      <li key={b.organisationId} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="font-semibold">{b.name}</span><span className="text-muted">{ROLE[b.role] ?? b.role} · {ORG_STATUS[b.organisationStatus] ?? b.organisationStatus}</span></li>
                    ))}
                  </ul>
                )}
              </section>
              {p.authenticator && (
                <section aria-label="Authenticator app">
                  <h2 className="text-sm font-bold">Authenticator app</h2>
                  <p className="text-sm text-muted">{p.authenticator.setUp ? `Set up. ${p.authenticator.backupCodesLeft} of 10 backup codes left.` : 'Not set up yet. Asked at their next log-in.'}</p>
                  {canClear && p.authenticator.setUp && (
                    <form action={clearAuthenticator} className="mt-2">
                      <input type="hidden" name="userId" value={p.userId} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className="btn btn-ghost !min-h-10 text-sm">Clear their app (lost phone)</button>
                    </form>
                  )}
                </section>
              )}
            </div>
            <section aria-label="National ID" className="card space-y-2 p-4">
              <h2 className="text-sm font-bold">National ID</h2>
              {!p.identity ? <p className="text-sm text-muted">Not sent (optional).</p> : (
                <>
                  <Facts rows={[['Number', <span key="nin" className="sazo-id">{p.identity.nin}</span>], ['Check', ID_STATUS[p.identity.status] ?? p.identity.status], ...(p.identity.decisionReason ? [['Reason', p.identity.decisionReason] as [string, string]] : [])]} />
                  <img src={`/admin/files/${p.identity.idPhotoEvidenceId}`} alt={`National ID photo sent by ${p.name}`} className="max-h-80 w-full rounded-lg border border-line object-contain" />
                </>
              )}
            </section>
          </div>
          <p className="text-xs text-muted">Opening an account is recorded in the audit log.</p>
        </>
      )}
    </section>
  );
}

/** A link that opens a person's account beside the side bar. */
export function PersonLink({ href, name }: { href: string; name: string }) {
  return <Link href={href} className="font-semibold text-primary-container underline decoration-dotted underline-offset-2 hover:decoration-solid">{name}</Link>;
}

/** Opens a car's records inside the console (was the public car page). */
export const carHref = (ref: string, back: string) => `/admin/cars/${ref}?back=${encodeURIComponent(back)}`;
