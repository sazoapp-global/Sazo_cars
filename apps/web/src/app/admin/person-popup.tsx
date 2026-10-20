'use client';
// A person's account in a popup over the console: contact, businesses and their National ID check with the
// ID photo, so staff never leave the list they are working through.
import { useState, useTransition } from 'react';
import { Facts, Popup } from '@/components/popup';
import { personDetails, type PersonDetails } from './person-actions';

const ROLE: Record<string, string> = { org_manager: 'Manager', org_staff: 'Staff', partner_operator: 'Data entry' };
const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' };
const ID_STATUS: Record<string, string> = { pending: 'Sent, waiting for a check', approved: 'Checked', rejected: 'Rejected' };

export function PersonPopup({ userId, name, label }: { userId: string; name: string; label?: string }) {
  const [p, setP] = useState<PersonDetails | null | undefined>();
  const [pending, start] = useTransition();
  return (
    <Popup title={name} onOpen={() => start(async () => setP(await personDetails(userId)))} buttonLabel={label ? undefined : `Account details for ${name}`}
      buttonClassName="font-semibold text-primary-container underline decoration-dotted underline-offset-2 hover:decoration-solid text-left" button={label ?? name}>
      {pending || p === undefined ? <div className="skeleton h-40" /> : p === null ? <p>Could not load this account.</p> : (
        <div className="space-y-4">
          <Facts rows={[
            ['Full name', p.name],
            ['Phone', p.phone ?? 'Not given'],
            ['Email', p.email ? `${p.email}${p.emailVerified ? '' : ' (not confirmed)'}` : 'Not given'],
            ['Gender', p.gender === 'female' ? 'Female' : p.gender === 'male' ? 'Male' : 'Not given'],
            ['Account', p.status === 'active' ? 'Active' : p.status],
          ]} />
          <section aria-label="Businesses">
            <h3 className="text-sm font-bold">Businesses</h3>
            {p.businesses.length === 0 ? <p className="text-sm text-muted">None.</p> : (
              <ul className="mt-1 divide-y divide-line text-sm">
                {p.businesses.map((b) => (
                  <li key={b.organisationId} className="flex flex-wrap justify-between gap-2 py-1.5"><span className="font-semibold">{b.name}</span><span className="text-muted">{ROLE[b.role] ?? b.role} · {ORG_STATUS[b.organisationStatus] ?? b.organisationStatus}</span></li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="National ID">
            <h3 className="text-sm font-bold">National ID</h3>
            {!p.identity ? <p className="text-sm text-muted">Not sent yet.</p> : (
              <div className="mt-1 space-y-2">
                <Facts rows={[['Number', <span key="nin" className="sazo-id">{p.identity.nin}</span>], ['Check', ID_STATUS[p.identity.status] ?? p.identity.status], ...(p.identity.decisionReason ? [['Reason', p.identity.decisionReason] as [string, string]] : [])]} />
                <img src={`/admin/files/${p.identity.idPhotoEvidenceId}`} alt={`National ID photo sent by ${p.name}`} className="max-h-72 w-full rounded-lg border border-line object-contain" />
              </div>
            )}
          </section>
          <p className="text-xs text-muted">Opening an account is recorded in the audit log.</p>
        </div>
      )}
    </Popup>
  );
}
