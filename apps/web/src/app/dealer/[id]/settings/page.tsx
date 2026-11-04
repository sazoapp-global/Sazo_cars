// Business settings (4 Nov 2026): the dealer's own stock-age levels, how long a broker keeps a customer, and the
// WhatsApp number for buyers, on their own page under Business settings in the side bar (they used to sit under
// the cars on Cars for sale). Managers only.
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame/app-frame';
import { api, isSignedIn } from '@/lib/api';
import type { DealerSettings, Me, MyOrganisation } from '@/lib/types';
import { saveSettings } from '../../actions';

export const metadata: Metadata = { title: 'Business settings', robots: { index: false } };

type SP = Promise<{ done?: string; error?: string }>;

export default async function DealerSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isSignedIn())) redirect(`/sign-in?next=/dealer/${id}/settings`);
  const org = (await api<MyOrganisation[]>('/me/organisations', { auth: true })).find((o) => o.id === id);
  if (!org || org.type !== 'dealer') notFound();
  if (org.role !== 'org_manager' || org.status === 'rejected' || org.status === 'suspended') redirect(`/dealer/${id}`);
  const approved = org.status === 'approved';
  const name = org.tradingName ?? org.legalName;
  const as = { auth: true, headers: { 'X-Organisation-Id': id } };
  const [settings, me] = await Promise.all([api<DealerSettings>('/dealer/settings', as).catch(() => undefined), api<Me>('/me', { auth: true }).catch(() => undefined)]);

  return (
    <AppFrame workspace="dealer" org={id} viewer={{ platformRoles: [], orgRole: org.role, approved }} business={{ name, approved }}
      person={me ? { name: me.displayName, role: 'Manager' } : undefined}>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">{name}: business settings</h1>
        <p className="mt-1 max-w-2xl text-muted">How SAZO works for your business. Only managers can change these.</p>
      </div>
      {sp.done && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">{sp.done}</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
      {!settings ? <p className="text-muted">The settings could not be loaded. Try again.</p> : (
        <section id="settings-section" className="rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="settings">
          <h2 id="settings" className="font-display text-lg font-bold">Settings</h2>
          {/* Three settings side by side, each with its label, box and note in line; Save underneath (28 Oct 2026). */}
          <form action={saveSettings} data-draft={`dealer-settings-${id}`} className="mt-3 space-y-4">
            <input type="hidden" name="org" value={id} />
            <div className="grid items-start gap-4 md:grid-cols-3">
              <div><label htmlFor="levels" className="label md:min-h-10">Warn me when a car has been in stock for (days)</label>
                <input id="levels" name="levels" defaultValue={settings.stockAgeAlertDays.join(', ')} className="field tabular-nums" />
                <p className="mt-1 text-xs text-muted">Up to 5 numbers, for example 90, 180, 240. These are your own business levels, not customs rules.</p></div>
              <div><label htmlFor="protection" className="label md:min-h-10">A broker keeps a customer they bring for (days)</label>
                <input id="protection" name="protection" inputMode="numeric" defaultValue={settings.leadProtectionDays} className="field tabular-nums" />
                <p className="mt-1 text-xs text-muted">One number, for example 30.</p></div>
              <div><label htmlFor="whatsapp" className="label md:min-h-10">WhatsApp number for buyers</label>
                <input id="whatsapp" name="whatsapp" type="tel" defaultValue={settings.whatsappE164 ?? ''} className="field" placeholder="0772 123 456" />
                <p className="mt-1 text-xs text-muted">Shown as an &ldquo;Ask on WhatsApp&rdquo; button on the car pages you share.</p></div>
            </div>
            <div className="flex justify-end border-t border-line pt-4"><button className="btn btn-primary">Save settings</button></div>
          </form>
        </section>
      )}
    </AppFrame>
  );
}
