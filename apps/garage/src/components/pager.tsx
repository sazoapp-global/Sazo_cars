// Pages for the app's lists that keep growing (4 Nov 2026), as on the website: at most 10 items a page, "Showing 1 to
// 10 of 17" and Previous, the page numbers and Next under the list. Lists of 10 or fewer show no controls. A new
// filter or search starts again at page 1.
import { useEffect, useState } from 'react';

export const PAGE_SIZE = 10;

/** This list's current page. `reset` is anything that changes what the list holds (a filter, a search). */
export function usePaged<T>(all: readonly T[], reset: unknown = null) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [reset]);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const p = Math.min(page, pages);
  const start = (p - 1) * PAGE_SIZE;
  return { items: all.slice(start, start + PAGE_SIZE), page: p, pages, total: all.length, from: all.length ? start + 1 : 0, to: Math.min(all.length, start + PAGE_SIZE), setPage };
}

/** Which numbers to show: all of them up to 7 pages, otherwise the first, the last and the pages around this one. */
function numbers(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => keep.add(n));
  const out: (number | 'gap')[] = [];
  let last = 0;
  for (const n of [...keep].sort((a, b) => a - b)) { if (n - last > 1) out.push('gap'); out.push(n); last = n; }
  return out;
}

export function Pager({ paged, noun }: { paged: ReturnType<typeof usePaged>; noun: string }) {
  const { page, pages, total, from, to, setPage } = paged;
  if (pages <= 1) return null;
  const go = (n: number) => { setPage(n); window.scrollTo({ top: 0 }); };
  const box = 'grid h-11 min-w-11 place-items-center rounded-[10px] px-2 font-bold tabular-nums';
  const step = 'inline-flex h-11 items-center rounded-[10px] border border-line bg-card px-3.5 font-bold text-primary disabled:text-muted/60';
  return (
    <nav aria-label="Pages" className="mt-4 space-y-2">
      <p className="text-sm text-muted">Showing <b className="text-on-surface">{from} to {to}</b> of <b className="text-on-surface">{total}</b> {noun}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={step} disabled={page <= 1} onClick={() => go(page - 1)}>‹ Previous</button>
        {numbers(page, pages).map((n, i) => n === 'gap'
          ? <span key={`g${i}`} aria-hidden className="px-1 text-muted">…</span>
          : <button key={n} type="button" aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} onClick={() => go(n)}
              className={`${box} ${n === page ? 'bg-primary-container text-white' : 'border border-line bg-card text-primary'}`}>{n}</button>)}
        <button type="button" className={step} disabled={page >= pages} onClick={() => go(page + 1)}>Next ›</button>
      </div>
    </nav>
  );
}
