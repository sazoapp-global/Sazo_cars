import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon, type IconName } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';
import type { MyOrganisation } from '@/lib/types';
import { sendDocuments } from '../actions';

export const metadata: Metadata = { title: 'Your business' };

/** Businesses that work in the SAZO phone app (garages, inspectors). */
const WORKSHOP = ['garage', 'inspector', 'inspection_centre'];
const GARAGE_APP_URL = process.env.SAZO_GARAGE_APP_URL ?? 'http://localhost:3002';

export default async function BusinessStatus({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/business/${id}`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org) notFound();
  const name = org.tradingName ?? org.legalName;
  const pending = org.status === 'pending_verification';
  const steps: { label: string; state: 'done' | 'now' | 'later'; icon: IconName }[] = [
    { label: 'Registered', state: 'done', icon: 'check_circle' },
    { label: org.verificationStatus === 'info_requested' ? 'SAZO needs more from you' : 'SAZO is checking', state: pending ? 'now' : 'done', icon: pending ? 'hourglass_empty' : 'check_circle' },
    { label: org.status === 'approved' ? 'Approved' : org.status === 'rejected' ? 'Not approved' : org.status === 'suspended' ? 'Suspended' : 'Approved', state: pending ? 'later' : 'done', icon: org.status === 'approved' ? 'verified' : pending ? 'verified' : 'report' },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 md:px-8">
      {sp.new && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{name} is registered. Next: send your documents.</p>}
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
      <h1 className="font-display text-2xl font-bold">{name}</h1>
      <ol className="card flex flex-col gap-3 p-4 sm:flex-row sm:justify-between" aria-label="Approval progress">
        {steps.map((s) => (
          <li key={s.label} className={`flex items-center gap-2 font-semibold ${s.state === 'later' ? 'text-label' : s.state === 'now' ? 'text-warn-text' : org.status === 'rejected' || org.status === 'suspended' ? 'text-bad-text' : 'text-ok-text'}`}>
            <Icon name={s.icon} />{s.label}<span className="sr-only">{s.state === 'done' ? ' (done)' : s.state === 'now' ? ' (in progress)' : ' (not yet)'}</span>
          </li>
        ))}
      </ol>

      {org.verificationStatus === 'info_requested' && org.infoRequested && (
        <div className="rounded-lg border border-warn-line bg-warn-fill p-4">
          <p className="font-semibold text-warn-text">SAZO asked:</p>
          <p className="mt-1">“{org.infoRequested}”</p>
        </div>
      )}

      {pending && org.role === 'org_manager' && (
        <section className="card p-4" aria-labelledby="docs">
          <h2 id="docs" className="font-display text-lg font-semibold">Send documents</h2>
          <p className="text-sm text-muted">Your trading licence or URSB certificate, and a photo of your premises with its signboard. Photos or PDFs, up to 8 MB each. {org.documents > 0 ? `You have sent ${org.documents} so far.` : ''}</p>
          <form action={sendDocuments} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={org.id} />
            <label htmlFor="documents" className="label">Files</label>
            <input id="documents" name="documents" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-soft-3 file:px-4 file:py-3 file:font-semibold file:text-primary" />
            <button className="btn btn-primary">Send to SAZO</button>
          </form>
        </section>
      )}

      {org.status === 'approved' && WORKSHOP.includes(org.type) && (
        <section className="card p-4">
          <h2 className="font-display text-lg font-semibold">You&apos;re ready</h2>
          <p className="text-muted">{org.type === 'garage'
            ? <>Open the SAZO Garage app on your phone and sign in with this phone number. Add your mechanics from the app&apos;s Staff screen.</>
            : <>Open the SAZO app on your phone and sign in with this phone number to record inspections. Add your inspectors from the app&apos;s Staff screen.</>}</p>
          <a href={GARAGE_APP_URL} className="btn btn-primary mt-3"><Icon name="garage" />{org.type === 'garage' ? 'Open the Garage app' : 'Open the SAZO app'}</a>
        </section>
      )}
      {org.status === 'approved' && !WORKSHOP.includes(org.type) && <p className="text-muted">Approved. Your workspace is coming soon — we&apos;ll send an SMS when it&apos;s ready.</p>}
      {(org.status === 'rejected' || org.status === 'suspended') && <p className="text-muted">Contact SAZO support if you think this is a mistake.</p>}
      <Link href="/account" className="link inline-block">Back to your account</Link>
    </div>
  );
}
