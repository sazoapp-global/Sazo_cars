'use client';
// Selling a car (D-146): the price and date, and for managers how the buyer pays: cash in full, or a deposit and
// monthly instalments. Shown in a pop-up over the car or the payments page.
import { useState } from 'react';
import { addPaymentPlan, sellCar } from './actions';

export interface BuyerChoice { leadId: string; name: string; phone: string | null }

const METHODS: [string, string][] = [['cash', 'Cash'], ['mtn_momo', 'MTN MoMo'], ['airtel_money', 'Airtel Money'], ['bank', 'Bank']];
const num = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString('en-US')}`;
/** Equal monthly amounts in whole thousands; the last one takes what is left over (as SAZO saves them). */
function monthly(total: number, months: number): [number, number] {
  const each = Math.floor(total / months / 1000) * 1000 || Math.floor(total / months);
  return [each, total - each * (months - 1)];
}
const nextMonth = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
};

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
 * paid for. `manager` false: sales staff record the price and date only (money is for managers).
 */
export function SaleForm({ org, carId, askingPriceUgx, salePriceUgx, today, manager, buyers, mode }: {
  org: string; carId: string; askingPriceUgx?: number; salePriceUgx?: number; today: string; manager: boolean; buyers: BuyerChoice[]; mode: 'sell' | 'plan';
}) {
  const [price, setPrice] = useState(salePriceUgx ? String(salePriceUgx) : '');
  const [kind, setKind] = useState('cash');
  const [buyer, setBuyer] = useState(buyers[0]?.leadId ?? 'new');
  const [deposit, setDeposit] = useState('');
  const [months, setMonths] = useState('12');
  const [soldOn, setSoldOn] = useState(today);
  const [method, setMethod] = useState('cash');
  const p = num(price);
  const d = num(deposit);
  const m = Math.max(0, Math.min(120, num(months)));
  const [each, last] = p > d && m > 0 ? monthly(p - d, m) : [0, 0];
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
            <input id="sale-date" name="soldOn" type="date" max={today} value={soldOn} onChange={(e) => setSoldOn(e.target.value)} className="field" />
          </div>
        </div>
      )}
      {mode === 'plan' && salePriceUgx && <p className="text-sm">Sold for <b>{ugx(salePriceUgx)}</b>.</p>}
      {!manager ? (
        <p className="text-sm text-muted">A manager records how the buyer pays, under Payments.</p>
      ) : (
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
          <Chips name="kind" label="How is the buyer paying?" value={kind} onChange={setKind} options={[['cash', 'Cash, in full'], ['instalments', 'Instalments']]} />
          {kind === 'instalments' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label htmlFor="deposit" className="label">Deposit (UGX)</label><input id="deposit" name="deposit" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="field tabular-nums" /></div>
              <div><label htmlFor="months" className="label">Number of months</label><input id="months" name="months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} className="field tabular-nums" /></div>
              <div><label htmlFor="first-due" className="label">First due date</label><input id="first-due" name="firstDueOn" type="date" min={soldOn} defaultValue={nextMonth(soldOn)} className="field" /></div>
            </div>
          )}
          {kind === 'instalments' && each > 0 && (
            <p className="rounded-lg bg-soft p-3 text-sm" aria-live="polite">
              {m} monthly payments of <b>{ugx(each)}</b>{last !== each ? <> (the last one {ugx(last)})</> : null}, after a deposit of {ugx(d)}.
            </p>
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
