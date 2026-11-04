// Pages for every list that can keep growing (4 Nov 2026): at most 10 items a page, with "Showing 1 to 10 of 17"
// and Previous, the page numbers and Next below the list. Lists of 10 or fewer show no controls. The page is in the
// address (?page=2, or its own name when a page has several lists), so Back, a refresh and a shared link come back
// to the same page; filters and searches stay as they are.
import Link from 'next/link';

export const PAGE_SIZE = 10;

export interface Paged<T> { items: T[]; page: number; pages: number; total: number; from: number; to: number }

/** One page of a list. A page number past the end shows the last page; anything unreadable shows the first. */
export function paginate<T>(all: readonly T[], page: string | string[] | undefined, size = PAGE_SIZE): Paged<T> {
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const asked = Number(Array.isArray(page) ? page[0] : page);
  const p = Number.isInteger(asked) && asked >= 1 ? Math.min(asked, pages) : 1;
  const start = (p - 1) * size;
  return { items: all.slice(start, start + size), page: p, pages, total, from: total ? start + 1 : 0, to: Math.min(total, start + size) };
}

/** The address of page `n` of a list: the same page and filters, with only this list's page changed. */
export function pageHref(path: string, params: Record<string, string | string[] | undefined>, key = 'page') {
  return (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === key || v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) if (one !== '') q.append(k, one);
    }
    if (n > 1) q.set(key, String(n));
    const s = q.toString();
    return `${path}${s ? `?${s}` : ''}`;
  };
}

/** Which numbers to show: all of them up to 7 pages, otherwise the first, the last and two either side of this one. */
export function pageNumbers(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => keep.add(n));
  const out: (number | 'gap')[] = [];
  let last = 0;
  for (const n of [...keep].sort((a, b) => a - b)) { if (n - last > 1) out.push('gap'); out.push(n); last = n; }
  return out;
}

const box = 'grid h-10 min-w-10 place-items-center rounded-[10px] px-2 font-bold tabular-nums';

/** The controls under a list. `noun` names what is counted ("cars sold", "records"). */
export function Pager({ paged, href, noun, label = 'Pages', scroll = true }: {
  paged: Pick<Paged<unknown>, 'page' | 'pages' | 'total' | 'from' | 'to'>; href: (n: number) => string; noun: string; label?: string; scroll?: boolean;
}) {
  const { page, pages, total, from, to } = paged;
  if (total <= PAGE_SIZE && pages <= 1) return null;
  const step = (n: number, text: string, dir: 'prev' | 'next') => {
    const off = n < 1 || n > pages;
    const content = dir === 'prev' ? <>‹ {text}</> : <>{text} ›</>;
    return off
      ? <span aria-disabled="true" className="inline-flex h-10 items-center rounded-[10px] border border-line bg-card px-3.5 font-bold text-muted/60">{content}</span>
      : <Link href={href(n)} scroll={scroll} rel={dir} className="inline-flex h-10 items-center rounded-[10px] border border-line bg-card px-3.5 font-bold text-primary hover:border-primary-container">{content}</Link>;
  };
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <p className="text-sm text-muted">Showing <b className="text-on-surface">{from} to {to}</b> of <b className="text-on-surface">{total}</b> {noun}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {step(page - 1, 'Previous', 'prev')}
        {pageNumbers(page, pages).map((n, i) => n === 'gap'
          ? <span key={`g${i}`} aria-hidden className="px-1 text-muted">…</span>
          : n === page
            ? <span key={n} aria-current="page" className={`${box} bg-primary-container text-white`}>{n}</span>
            : <Link key={n} href={href(n)} scroll={scroll} aria-label={`Page ${n}`} className={`${box} border border-line bg-card text-primary hover:border-primary-container`}>{n}</Link>)}
        {step(page + 1, 'Next', 'next')}
      </div>
    </nav>
  );
}

/** The same controls as buttons, for lists built in the browser (the notifications panel). */
export function ButtonPager({ paged, onPage, noun }: { paged: Pick<Paged<unknown>, 'page' | 'pages' | 'total' | 'from' | 'to'>; onPage: (n: number) => void; noun: string }) {
  const { page, pages, total, from, to } = paged;
  if (pages <= 1) return null;
  const step = 'inline-flex h-10 items-center rounded-[10px] border border-line bg-card px-3.5 font-bold text-primary disabled:text-muted/60';
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Showing <b className="text-on-surface">{from} to {to}</b> of <b className="text-on-surface">{total}</b> {noun}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={step} disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Previous</button>
        {pageNumbers(page, pages).map((n, i) => n === 'gap'
          ? <span key={`g${i}`} aria-hidden className="px-1 text-muted">…</span>
          : <button key={n} type="button" aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} onClick={() => onPage(n)}
              className={`${box} ${n === page ? 'bg-primary-container text-white' : 'border border-line bg-card text-primary'}`}>{n}</button>)}
        <button type="button" className={step} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
      </div>
    </nav>
  );
}
