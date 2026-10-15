'use client';
// The compare pop-up: add cars by number plate, or pick from the cars dealers have for sale, then compare
// two or three side by side.
import { formatUgx } from '@sazo/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { findCarToCompare, type PickedCar } from './actions';

export interface ForSaleCar { vehicleRef: string; name: string; plate?: string; askingPriceUgx: number; listedMileageKm: number | null; dealerName: string }

const MAX = 3;

export function CompareDialog({ initial, forSale, closeHref }: { initial: PickedCar[]; forSale: ForSaleCar[]; closeHref: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [tab, setTab] = useState<'plate' | 'sale'>('plate');
  const [picked, setPicked] = useState<PickedCar[]>(initial);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);

  const has = (r: string) => picked.some((p) => p.ref === r);
  const full = picked.length >= MAX;
  const add = (c: PickedCar) => { setError(undefined); if (!has(c.ref) && !full) setPicked((p) => [...p, c]); };
  const remove = (r: string) => setPicked((p) => p.filter((c) => c.ref !== r));

  function lookUp(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await findCarToCompare(query);
      if (r.error || !r.car) { setError(r.error); return; }
      if (has(r.car.ref)) { setError('That car is already in the list.'); return; }
      add(r.car);
      setQuery('');
    });
  }

  const compare = () => router.push(`/compare?${picked.map((p) => `r=${p.ref}`).join('&')}`);
  const close = () => { ref.current?.close(); router.push(closeHref); };

  return (
    <dialog ref={ref} aria-labelledby="cmp-title" onCancel={(e) => { e.preventDefault(); close(); }}
      className="m-auto w-[min(640px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-hidden rounded-[14px] border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/60">
      <div className="flex max-h-[calc(100dvh-32px)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 id="cmp-title" className="font-display text-xl font-bold">Compare cars</h2>
            <p className="text-sm text-muted">Choose two or three cars. Add them by number plate, or pick from cars for sale.</p>
          </div>
          <button type="button" onClick={close} className="btn btn-ghost !min-h-10 !px-2" aria-label="Close"><Icon name="close" /></button>
        </div>

        <div className="border-b border-line px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-label">Your cars to compare ({picked.length} of {MAX})</p>
          {picked.length === 0 ? <p className="mt-1 text-sm text-muted">None yet.</p> : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {picked.map((p) => (
                <li key={p.ref} className="flex items-center gap-2 rounded-full border border-line bg-soft py-1 pl-3 pr-1 text-sm font-semibold">
                  {p.name}{p.plate && <Plate value={p.plate} size="sm" />}
                  <button type="button" onClick={() => remove(p.ref)} className="grid size-7 place-items-center rounded-full hover:bg-line" aria-label={`Remove ${p.name}`}><Icon name="close" size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div role="tablist" aria-label="How to add a car" className="mx-5 mt-4 grid grid-cols-2 gap-1 rounded-lg bg-soft p-1">
          {([['plate', 'Enter a number plate'], ['sale', `Cars for sale (${forSale.length})`]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" id={`tab-${k}`} aria-controls={`panel-${k}`} aria-selected={tab === k} onClick={() => setTab(k)}
              className={`min-h-10 rounded-md text-sm font-semibold ${tab === k ? 'bg-card text-primary-container shadow' : 'text-muted'}`}>{label}</button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'plate' ? (
            <form id="panel-plate" role="tabpanel" aria-labelledby="tab-plate" onSubmit={lookUp} noValidate>
              <label htmlFor="cmp-plate" className="label">Number plate, VIN or chassis number</label>
              <div className="flex gap-2">
                <input id="cmp-plate" className="field flex-1 uppercase" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="UBA 123A"
                  autoComplete="off" disabled={full} aria-describedby={error ? 'cmp-err' : undefined} />
                <button className="btn btn-primary" disabled={pending || full}><Icon name="add" />{pending ? 'Looking…' : 'Add'}</button>
              </div>
              {full && <p className="mt-2 text-sm text-muted">You have three cars. Remove one to add another.</p>}
              {error && <p id="cmp-err" role="alert" className="mt-2 text-sm font-semibold text-bad-text">{error}</p>}
            </form>
          ) : (
            <div id="panel-sale" role="tabpanel" aria-labelledby="tab-sale">
              {forSale.length === 0 ? <p className="text-muted">No dealer has cars listed for sale right now.</p> : (
                <ul className="space-y-2">
                  {forSale.map((c) => {
                    const on = has(c.vehicleRef);
                    return (
                      <li key={c.vehicleRef}>
                        <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${on ? 'border-primary-container bg-soft' : 'border-line'} ${!on && full ? 'opacity-60' : ''}`}>
                          <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#0033aa]" checked={on} disabled={!on && full}
                            onChange={() => (on ? remove(c.vehicleRef) : add({ ref: c.vehicleRef, name: c.name, plate: c.plate }))} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 font-semibold">{c.name}{c.plate && <Plate value={c.plate} size="sm" />}</span>
                            <span className="block text-sm text-muted">{formatUgx(c.askingPriceUgx)}{c.listedMileageKm !== null ? ` · ${c.listedMileageKm.toLocaleString('en-UG')} km` : ''} · {c.dealerName}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line p-5">
          <p className="text-sm text-muted">{picked.length < 2 ? `Add ${2 - picked.length === 1 ? 'one more car' : 'two cars'} to compare.` : 'Ready to compare.'}</p>
          <button type="button" className="btn btn-focal" disabled={picked.length < 2} onClick={compare}><Icon name="compare_arrows" />Compare {picked.length >= 2 ? picked.length : ''} cars</button>
        </div>
      </div>
    </dialog>
  );
}
