'use client';
// Selling a car (D-146): the price and date, and how the buyer pays: cash in full, or a deposit and monthly
// instalments. Shown in a pop-up over the car or the payments page. Since D-185 (15 Nov 2026) whoever sells the car
// records how it is paid, and names the broker who brought the buyer, if any.
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { addPaymentPlan, sellCar } from './actions';

export interface BuyerChoice { leadId: string; name: string; phone: string | null; broker?: string | null }
export interface BrokerChoice { userId: string; name: string; worksWithYou: boolean }

const METHODS: [string, string][] = [['cash', 'Cash'], ['mtn_momo', 'MTN MoMo'], ['airtel_money', 'Airtel Money'], ['bank', 'Bank']];
const num = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString('en-US')}`;
/** Equal monthly amounts in whole thousands; the last one takes what is left over (as SAZO saves them). */
function monthly(total: number, months: number): [number, number] {
  const each = Math.floor(total / months / 1000) * 1000 || Math.floor(total / months);
  return [each, total - each * (months - 1)];
}
const nextMonth = (day: string) => addMonths(day, 1);
/** The same day of the month n months later; the 31st becomes the last day of a shorter month (as SAZO saves them). */
function addMonths(day: string, n: number): string {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, mo - 1 + n, 1));
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, lastDay));
  return t.toISOString().slice(0, 10);
}
const longDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
/** A monthly amount the buyer can pay: that amount each month, and what is left in the last month. */
function byAmount(total: number, each: number): number[] {
  if (each <= 0 || total <= 0) return [];
  const months = Math.ceil(total / each);
  if (months > 120) return Array(months).fill(0);
  return Array.from({ length: months }, (_, k) => (k < months - 1 ? each : total - each * (months - 1)));
}

function Chips({ name, options, value, onChange, label }: { name: string; options: [string, string][]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <label key={v} className={`cursor-pointer rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${value === v ? 'border-primary-container bg-soft text-primary-container' : 'border-line text-ink'}`}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />{l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * `mode="sell"`: the car is in stock (price and date first). `mode="plan"`: the car was sold before; only how it is
 * paid for. `brokers`: approved brokers the sale can name, those who work with the dealer first.
 */
export function SaleForm({ org, carId, askingPriceUgx, salePriceUgx, today, buyers, brokers, mode, minDepositPercent }: {
  org: string; carId: string; askingPriceUgx?: number; salePriceUgx?: number; today: string; buyers: BuyerChoice[]; brokers: BrokerChoice[]; mode: 'sell' | 'plan';
  /** The dealer's lowest deposit, as a % of the price (D-190): a warning below it, never a block. */
  minDepositPercent?: number | null;
}) {
  const [price, setPrice] = useState(salePriceUgx ? String(salePriceUgx) : '');
  const [kind, setKind] = useState('cash');
  const [buyer, setBuyer] = useState(buyers[0]?.leadId ?? 'new');
  const [deposit, setDeposit] = useState('');
  const [months, setMonths] = useState('12');
  // Work the payments out from the number of months, or from what the buyer can pay each month (D-190).
  const [by, setBy] = useState('months');
  const [monthlyIn, setMonthlyIn] = useState('');
  const [soldOn, setSoldOn] = useState(today);
  const [firstDue, setFirstDue] = useState(nextMonth(today));
  const [method, setMethod] = useState('cash');
  const [viaBroker, setViaBroker] = useState('no');
  const [broker, setBroker] = useState('');
  const chosen = buyers.find((b) => b.leadId === buyer);
  const brokerName = brokers.find((b) => b.userId === broker)?.name;
  const p = num(price);
  const d = num(deposit);
  const balance = p > d ? p - d : 0;
  const m = Math.max(0, Math.min(120, num(months)));
  const amounts: number[] = by === 'amount' ? byAmount(balance, num(monthlyIn))
    : balance > 0 && m > 0 ? (() => { const [each, last] = monthly(balance, m); return Array.from({ length: m }, (_, k) => (k < m - 1 ? each : last)); })() : [];
  const tooLong = amounts.length > 120;
  const ready = amounts.length > 0 && !tooLong;
  const each = amounts[0] ?? 0;
  const last = amounts.at(-1) ?? 0;
  const share = p > 0 && d > 0 ? Math.round((d / p) * 100) : 0;
  const lowest = minDepositPercent && p > 0 ? Math.ceil((p * minDepositPercent) / 100) : 0;
  const belowLowest = !!minDepositPercent && p > 0 && d < lowest;
  return (
    <form action={mode === 'sell' ? sellCar : addPaymentPlan} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="id" value={carId} />
      {mode === 'sell' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="sale-price" className="label">Sold for (UGX), private</label>
            <input id="sale-price" name="price" required inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="field tabular-nums"
              placeholder={askingPriceUgx ? askingPriceUgx.toLocaleString('en-US') : undefined} />
          </div>
          <div>
            <label htmlFor="sale-date" className="label">Date</label>
            <input id="sale-date" name="soldOn" type="date" max={today} value={soldOn} onChange={(e) => { setSoldOn(e.target.value); if (e.target.value) setFirstDue(nextMonth(e.target.value)); }} className="field" />
          </div>
        </div>
      )}
      {mode === 'plan' && salePriceUgx && <p className="text-sm">Sold for <b>{ugx(salePriceUgx)}</b>.</p>}
      {(
        <>
          <div>
            <label htmlFor="sale-buyer" className="label">Buyer</label>
            <select id="sale-buyer" name="leadId" value={buyer} onChange={(e) => setBuyer(e.target.value)} className="field">
              {buyers.map((b) => <option key={b.leadId} value={b.leadId}>{b.name}{b.phone ? ` · ${b.phone}` : ''} (from the enquiry)</option>)}
              <option value="new">Someone else: type their name and phone</option>
            </select>
          </div>
          {buyer === 'new' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="buyer-name" className="label">Buyer&apos;s name</label><input id="buyer-name" name="buyerName" required autoComplete="off" className="field" /></div>
              <div><label htmlFor="buyer-phone" className="label">Buyer&apos;s phone</label><input id="buyer-phone" name="buyerPhone" required type="tel" inputMode="tel" placeholder="0772 123 456" className="field" /></div>
            </div>
          )}
          {chosen?.broker ? (
            <p className="rounded-lg bg-soft p-3 text-sm"><b>{chosen.broker}</b> brought this buyer. Their commission is due at the buyer&apos;s first payment, then a manager approves it.</p>
          ) : brokers.length > 0 && (
            <>
              <Chips name="viaBroker" label="Did a broker bring this buyer?" value={viaBroker} onChange={setViaBroker} options={[['no', 'No'], ['yes', 'Yes, a broker']]} />
              {viaBroker === 'yes' && (
                <div>
                  <label htmlFor="sale-broker" className="label">Broker</label>
                  <select id="sale-broker" name="broker" required value={broker} onChange={(e) => setBroker(e.target.value)} className="field">
                    <option value="" disabled>Choose the broker</option>
                    {brokers.map((b) => <option key={b.userId} value={b.userId}>{b.name}{b.worksWithYou ? ' · works with you' : ''}</option>)}
                  </select>
                  {brokerName && <p className="mt-1.5 text-sm text-muted">{brokerName} sees this sale under their commission. Commission is due at the buyer&apos;s first payment, then a manager approves it.</p>}
                </div>
              )}
            </>
          )}
          <Chips name="kind" label="How is the buyer paying?" value={kind} onChange={setKind} options={[['cash', 'Cash, in full'], ['instalments', 'Instalments']]} />
          {kind === 'instalments' && (
            <>
              <Chips name="by" label="Work out the monthly payments" value={by} onChange={setBy} options={[['months', 'By number of months'], ['amount', 'By monthly amount']]} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="deposit" className="label">Deposit (UGX)</label>
                  <input id="deposit" name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="field tabular-nums"
                    aria-describedby="deposit-note" placeholder={lowest ? n0(lowest) : undefined} />
                  <p id="deposit-note" className="mt-1 text-xs text-muted">Paid today.{share ? ` ${share}% of the price.` : ''}</p>
                </div>
                {by === 'months' ? (
                  <div>
                    <label htmlFor="months" className="label">Number of months</label>
                    <input id="months" name="months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} className="field tabular-nums" />
                    <p className="mt-1 text-xs text-muted">Up to 120 months.</p>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="monthly" className="label">Each month (UGX)</label>
                    <input id="monthly" inputMode="numeric" value={monthlyIn} onChange={(e) => setMonthlyIn(e.target.value)} className="field tabular-nums" aria-describedby="monthly-note" />
                    <p id="monthly-note" className="mt-1 text-xs text-muted">What the buyer can pay each month.</p>
                    {/* SAZO works out the months; the plan saves the same amounts as shown here. */}
                    {ready && <><input type="hidden" name="months" value={amounts.length} /><input type="hidden" name="amounts" value={JSON.stringify(amounts)} /></>}
                  </div>
                )}
                <div>
                  <label htmlFor="first-due" className="label">First due date</label>
                  <input id="first-due" name="firstDueOn" type="date" min={soldOn} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className="field" />
                  <p className="mt-1 text-xs text-muted">Then the same day each month.</p>
                </div>
              </div>
              {belowLowest && (
                <p role="status" className="flex gap-2 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm text-warn-text">
                  <Icon name="warning" className="shrink-0" />
                  <span>This deposit is below your lowest deposit of {minDepositPercent}% ({ugx(lowest)}). You can still save the sale.</span>
                </p>
              )}
              {tooLong && <p role="alert" className="text-sm font-semibold text-bad-text">At that amount it takes {amounts.length} months. The most is 120: ask for a bigger monthly amount or deposit.</p>}
              {ready && (
                <section aria-live="polite" aria-label="How the buyer pays" className="rounded-[14px] border border-soft-3 bg-soft px-4 py-3 text-sm">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-label">How the buyer pays</p>
                  <dl className="mt-1 divide-y divide-soft-3">
                    {([
                      ['Sold for', n0(p), false], ['Deposit, paid today', n0(d), false], ['Balance to pay', n0(balance), true],
                      ['Monthly payment', amounts.length === 1 ? `${n0(each)} × 1 month` : last === each ? `${n0(each)} × ${amounts.length} months` : `${n0(each)} × ${amounts.length - 1}, then ${n0(last)}`, true],
                      ['First payment', longDate(firstDue), false], ['Last payment', longDate(addMonths(firstDue, amounts.length - 1)), false],
                    ] as [string, string, boolean][]).map(([k, v, bold]) => (
                      <div key={k} className="flex justify-between gap-3 py-1.5"><dt className="text-muted">{k}</dt><dd className={`text-right tabular-nums ${bold ? 'font-extrabold text-ink' : 'font-semibold'}`}>{v}</dd></div>
                    ))}
                  </dl>
                  <details className="mt-1">
                    <summary className="cursor-pointer py-1 font-bold text-primary-container">See all {amounts.length + (d > 0 ? 1 : 0)} payments</summary>
                    <table className="mt-1 w-full tabular-nums">
                      <tbody>
                        {d > 0 && <tr><td className="py-1">Deposit</td><td>{longDate(soldOn)}</td><td className="text-right">{n0(d)}</td></tr>}
                        {amounts.map((a, k) => <tr key={k}><td className="py-1">{k + 1}</td><td>{longDate(addMonths(firstDue, k))}</td><td className="text-right">{n0(a)}</td></tr>)}
                      </tbody>
                    </table>
                  </details>
                </section>
              )}
            </>
          )}
          {(kind === 'cash' || d > 0) && (
            <>
              <Chips name="method" label={kind === 'cash' ? 'How was it paid?' : 'How was the deposit paid?'} value={method} onChange={setMethod} options={METHODS} />
              <div><label htmlFor="pay-ref" className="label">Reference (optional)</label><input id="pay-ref" name="reference" maxLength={80} placeholder="e.g. MoMo ID or bank slip number" className="field" /></div>
            </>
          )}
          {kind === 'instalments' && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="reminders" defaultChecked className="mt-1 h-4 w-4" />
              <span>Text the buyer before each due date and if a payment is late</span>
            </label>
          )}
          <p className="text-sm text-muted">The buyer gets an SMS receipt for what they paid. Saved payments can&apos;t be edited; a mistake is corrected and both stay on record.</p>
        </>
      )}
      <div className="flex justify-end"><button type="submit" className="btn btn-primary">{mode === 'sell' ? 'Save the sale' : 'Save'}</button></div>
    </form>
  );
}
