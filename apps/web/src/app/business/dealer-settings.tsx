// Business settings (D-192, 18 Nov 2026): now a section of Business details, for a dealer's managers. Stock age
// levels, how long a broker keeps a customer, the WhatsApp number for buyers and the lowest deposit.
import type { DealerSettings } from '@/lib/types';
import { saveSettings } from '../dealer/actions';

export function DealerSettingsCard({ id, settings }: { id: string; settings: DealerSettings }) {
  return (
        <section id="settings" className="card scroll-mt-24 p-4 md:p-5 xl:col-span-2" aria-labelledby="settings-h">
          <h2 id="settings-h" className="font-display text-lg font-bold">Business settings</h2>
          {/* The settings side by side, each with its label, box and note in line; Save underneath (28 Oct 2026). */}
          <form action={saveSettings} data-draft={`dealer-settings-${id}`} className="mt-3 space-y-4">
            <input type="hidden" name="org" value={id} />
            <div className="grid items-start gap-4 md:grid-cols-2">
              <div><label htmlFor="levels" className="label md:min-h-10">Warn me when a car has been in stock for (days)</label>
                <input id="levels" name="levels" defaultValue={settings.stockAgeAlertDays.join(', ')} className="field tabular-nums" />
                <p className="mt-1 text-xs text-muted">Up to 5 numbers, for example 90, 180, 240. These are your own business levels, not customs rules.</p></div>
              <div><label htmlFor="protection" className="label md:min-h-10">A broker keeps a customer they bring for (days)</label>
                <input id="protection" name="protection" inputMode="numeric" defaultValue={settings.leadProtectionDays} className="field tabular-nums" />
                <p className="mt-1 text-xs text-muted">One number, for example 30.</p></div>
              <div><label htmlFor="whatsapp" className="label md:min-h-10">WhatsApp number for buyers</label>
                <input id="whatsapp" name="whatsapp" type="tel" defaultValue={settings.whatsappE164 ?? ''} className="field" placeholder="0772 123 456" />
                <p className="mt-1 text-xs text-muted">Shown as an &ldquo;Ask on WhatsApp&rdquo; button on the car pages you share.</p></div>
              {/* The lowest deposit (D-190): the sale form warns below it, and still lets the sale through. */}
              <div><label htmlFor="min-deposit" className="label md:min-h-10">Lowest deposit on instalments (% of the price)</label>
                <input id="min-deposit" name="minDeposit" inputMode="numeric" defaultValue={settings.minDepositPercent ?? ''} className="field tabular-nums" placeholder="For example 30" />
                <p className="mt-1 text-xs text-muted">Leave it empty for no lowest deposit. Below it, the sale form shows a warning; the sale can still be saved.</p></div>
            </div>
            <div className="flex justify-end border-t border-line pt-4"><button className="btn btn-primary">Save settings</button></div>
          </form>
        </section>
  );
}
