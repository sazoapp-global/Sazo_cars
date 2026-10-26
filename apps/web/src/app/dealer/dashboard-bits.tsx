// Pieces of the dealer dashboard and payments pages (D-146): a card that opens part of the console, and the
// monthly sales graph (drawn as SVG on the server, with the same figures in a table for screen readers).
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';

export function DashCard({ href, icon, label, value, sub, tone }: { href: string; icon: IconName; label: string; value: string; sub?: string; tone?: 'bad' | 'lime' }) {
  return (
    <Link href={href} className="group flex items-start gap-3 rounded-[14px] border border-line bg-card p-4 hover:border-primary-container hover:shadow-sm">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === 'bad' ? 'bg-bad-fill text-bad-text' : tone === 'lime' ? 'bg-lime/30 text-primary' : 'bg-soft text-primary-container'}`}>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-muted">{label}</span>
        <span className={`block font-display text-2xl font-extrabold tabular-nums ${tone === 'bad' ? 'text-bad-text' : 'text-ink'}`}>{value}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      <Icon name="chevron_right" size={20} className="shrink-0 text-label group-hover:text-primary-container" />
    </Link>
  );
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (ym: string) => MONTH[Number(ym.slice(5, 7)) - 1] ?? ym;
const millions = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 || n >= 100_000_000 ? 0 : 1)}M` : n.toLocaleString('en-US'));

/** A step for the axis: 1, 2 or 5 times a power of ten, giving about four lines. */
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw)!;
}

/** Bars per month: the value (or number of cars), the number of cars sold on top, this month in lime. */
export function SalesChart({ monthly, show }: { monthly: { month: string; cars: number; valueUgx?: number }[]; show: 'value' | 'cars' }) {
  const vals = monthly.map((m) => (show === 'value' ? m.valueUgx ?? 0 : m.cars));
  const step = niceStep(Math.max(...vals));
  const top = step * Math.max(1, Math.ceil(Math.max(...vals) / step));
  const W = 640, H = 240, L = 44, B = 26, T = 16;
  const cw = (W - L - 4) / monthly.length;
  const y = (v: number) => H - B - (v / top) * (H - B - T);
  const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);
  const label = show === 'value' ? 'Sales value in UGX by month' : 'Cars sold by month';
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${label}, last 12 months`}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={W} y1={y(g)} y2={y(g)} className="stroke-line" />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" className="fill-label text-[10px]">{show === 'value' ? millions(g) : g}</text>
          </g>
        ))}
        {monthly.map((m, i) => {
          const v = vals[i]!;
          const x = L + i * cw + cw * 0.18;
          const w = cw * 0.64;
          const now = i === monthly.length - 1;
          return (
            <g key={m.month}>
              {v > 0 && <rect x={x} y={y(v)} width={w} height={H - B - y(v)} rx={4} className={now ? 'fill-lime' : 'fill-primary-container'} />}
              {m.cars > 0 && <text x={x + w / 2} y={y(v) - 4} textAnchor="middle" className="fill-ink text-[10px] font-bold">{m.cars}</text>}
              <text x={x + w / 2} y={H - 8} textAnchor="middle" className="fill-label text-[10px]">{monthName(m.month)}</text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Month</th><th>Cars sold</th>{show === 'value' && <th>Value (UGX)</th>}</tr></thead>
        <tbody>{monthly.map((m) => <tr key={m.month}><td>{monthName(m.month)} {m.month.slice(0, 4)}</td><td>{m.cars}</td>{show === 'value' && <td>{(m.valueUgx ?? 0).toLocaleString('en-US')}</td>}</tr>)}</tbody>
      </table>
    </figure>
  );
}

export const STATE: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'border-ok-line bg-ok-fill text-ok-text' },
  part_paid: { label: 'Part paid', cls: 'border-warn-line bg-warn-fill text-warn-text' },
  late: { label: 'Late', cls: 'border-bad-line bg-bad-fill text-bad-text' },
  due_soon: { label: 'Due soon', cls: 'border-soft-3 bg-soft text-primary-container' },
  coming: { label: 'Coming', cls: 'border-na-line bg-na-fill text-na-text' },
  owing: { label: 'Owing', cls: 'border-soft-3 bg-soft text-primary-container' },
};
export const Pill = ({ state, text }: { state: string; text?: string }) => (
  <span className={`chip whitespace-nowrap ${STATE[state]?.cls ?? ''}`}>{text ?? STATE[state]?.label ?? state}</span>
);
export const METHOD: Record<string, string> = { cash: 'Cash', mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank: 'Bank', correction: 'Correction' };
export const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
