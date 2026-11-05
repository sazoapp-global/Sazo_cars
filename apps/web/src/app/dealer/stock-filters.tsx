'use client';
// Search and the kind of car for the dealer's lists (5 Nov 2026, D-163): the list changes as you type, after a
// short pause, without pressing a button and without reloading the page. The address keeps the search, so Back,
// a refresh and a shared link come back to the same list. A new search starts again at page 1.
import { KIND_LABELS, type VehicleKind } from '@sazo/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';

export function StockFilters({ kinds }: { kinds: VehicleKind[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const go = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete('page');
    for (const k of ['done', 'error']) next.delete(k);
    const s = next.toString();
    start(() => router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false }));
  };
  const type = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v.trim() }), 300);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div role="search" className="relative min-w-0 flex-1">
        <label htmlFor="stock-q" className="sr-only">Search plate, make or model</label>
        <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input id="stock-q" type="search" value={q} onChange={(e) => type(e.target.value)} placeholder="Search plate, make, model" autoComplete="off"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer.current); go({ q: q.trim() }); } }}
          className="field !min-h-10 !pl-10 !pr-10 text-sm [&::-webkit-search-cancel-button]:hidden" />
        {q && <button type="button" onClick={() => { clearTimeout(timer.current); setQ(''); go({ q: '' }); }} aria-label="Clear the search"
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-soft"><Icon name="close" size={18} /></button>}
      </div>
      <label htmlFor="stock-kind" className="sr-only">Kind of car</label>
      <select id="stock-kind" value={params.get('kind') ?? ''} onChange={(e) => go({ kind: e.target.value })} className="field !min-h-10 text-sm sm:!w-auto sm:min-w-44">
        <option value="">All kinds</option>
        {kinds.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>
    </div>
  );
}
