'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Icon } from '@/components/icon';
import type { CarOption } from './types';

/**
 * Writing a message (D-173): "Add a car" puts one of the allowed cars in it as a card, Enter sends and
 * Shift+Enter starts a new line. The car list has a live search by name, year or plate (D-176): the arrow keys
 * move through the cars that match and Enter picks one. The form's hidden fields say where it goes.
 */
export function Composer({ action, hidden, cars, carsLabel }: {
  action: (form: FormData) => void | Promise<void>; hidden: Record<string, string>; cars: CarOption[]; carsLabel: string;
}) {
  const [car, setCar] = useState<CarOption>();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const squash = (t: string) => t.toLowerCase().replace(/\s+/g, '');
  // Every word must appear in the name, the plate (spaces ignored, so "uax123" finds UAX 123A) or the detail.
  const shown = cars.filter((c) => words.every((w) => `${c.name} ${c.detail}`.toLowerCase().includes(w) || squash(c.plate ?? '').includes(squash(w))));
  const open = (on: boolean) => { setPicking(on); setQ(''); setAt(0); };
  const pick = (c: CarOption) => { setCar(c); open(false); };
  const box = useRef<HTMLDivElement>(null);
  const list = useId();
  useEffect(() => {
    if (!picking) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) open(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') open(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [picking]);
  return (
    <form action={action} className="bg-soft px-3 py-2.5 md:px-4">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {car && <input type="hidden" name="stock" value={car.stockId} />}
      {car && (
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-card p-2 shadow-sm">
          {car.photoUrl ? <img src={car.photoUrl} alt="" className="h-10 w-14 rounded object-cover" /> : <Icon name="directions_car" className="text-label" />}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{car.name}</p><p className="truncate text-xs text-muted">{car.detail}</p></div>
          <button type="button" onClick={() => setCar(undefined)} aria-label={`Take ${car.name} out of the message`} className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-card"><Icon name="close" size={18} /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {cars.length > 0 && (
          <div ref={box} className="relative shrink-0">
            <button type="button" onClick={() => open(!picking)} aria-expanded={picking} aria-controls={list}
              className="grid h-11 w-11 place-items-center rounded-full text-primary-container hover:bg-card">
              <Icon name="directions_car" size={24} /><span className="sr-only">Add a car</span>
            </button>
            {picking && (
              <div id={list} role="group" aria-label={carsLabel} className="absolute bottom-full left-0 z-40 mb-2 max-h-96 w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[14px] border border-line bg-card p-1.5 shadow-xl">
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-label">{carsLabel}</p>
                <label className="mx-1 mb-1.5 mt-1 flex h-11 items-center gap-2 rounded-full bg-soft px-3.5 text-muted focus-within:ring-2 focus-within:ring-primary-container">
                  <Icon name="search" size={20} />
                  <span className="sr-only">Search your cars</span>
                  <input type="search" autoFocus value={q} placeholder="Search by name, year or plate" aria-controls={`${list}-cars`}
                    onChange={(e) => { setQ(e.target.value); setAt(0); }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, shown.length - 1)); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
                      else if (e.key === 'Enter') { e.preventDefault(); if (shown[at]) pick(shown[at]); }
                    }}
                    className="h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
                </label>
                <div id={`${list}-cars`} aria-live="polite">
                  {shown.map((c, i) => (
                    <button key={c.stockId} type="button" onClick={() => pick(c)} onMouseEnter={() => setAt(i)}
                      className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${i === at ? 'bg-soft' : ''}`}>
                      {c.photoUrl ? <img src={c.photoUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" /> : <span className="grid h-10 w-14 shrink-0 place-items-center rounded bg-soft"><Icon name="directions_car" size={20} className="text-label" /></span>}
                      <span className="min-w-0"><span className="block truncate text-sm font-bold">{c.name}</span><span className="block truncate text-xs text-muted">{c.detail}</span></span>
                    </button>
                  ))}
                  {shown.length === 0 && <p className="px-2.5 py-4 text-center text-sm text-muted">No cars match. Try the year or the plate.</p>}
                </div>
              </div>
            )}
          </div>
        )}
        <label className="sr-only" htmlFor={`${list}-body`}>Message</label>
        <textarea id={`${list}-body`} name="body" required maxLength={2000} rows={1} placeholder="Type a message"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          className="min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border-0 bg-card px-4 py-2.5 leading-snug shadow-sm" />
        <Send />
      </div>
    </form>
  );
}

function Send() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-container text-white disabled:opacity-60">
      <Icon name="send" size={20} />
    </button>
  );
}
