import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api, isSignedIn } from '@/lib/api';
import type { Me } from '@/lib/types';
import { signOut } from '../sign-in/actions';

export const metadata: Metadata = { title: 'Your account' };

const ORG_STATUS: Record<string, string> = { pending_verification: 'Waiting for SAZO approval', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended' };

export default async function Account() {
  if (!(await isSignedIn())) redirect('/sign-in?next=/account');
  const me = await api<Me>('/me', { auth: true }).catch(() => undefined);
  if (!me) redirect('/sign-in?next=/account');
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Hello, {me.displayName}</h1>
      {me.memberships.length > 0 && (
        <section className="card p-5" aria-labelledby="orgs">
          <h2 id="orgs" className="font-display text-lg font-semibold">Your businesses</h2>
          <ul className="mt-2 divide-y divide-line">
            {me.memberships.map((m) => (
              <li key={m.organisationId} className="flex items-center justify-between gap-3 py-2">
                <a href={`/business/${m.organisationId}`} className="link">{m.organisationName}</a>
                <span className="text-sm text-muted">{ORG_STATUS[m.organisationStatus] ?? m.organisationStatus}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <a href="/business/register" className="btn btn-ghost">Register a business</a>
      <form action={signOut}><button type="submit" className="btn btn-ghost">Sign out</button></form>
    </div>
  );
}
