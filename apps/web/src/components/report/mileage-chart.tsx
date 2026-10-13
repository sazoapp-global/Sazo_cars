import { formatDate } from '@sazo/contracts';
import type { Reading } from '@/lib/report-data';

const W = 520, H = 240, PAD = { l: 48, r: 24, t: 28, b: 36 };
const short = (km: number) => (km >= 1000 ? `${(km / 1000).toFixed(km >= 100_000 ? 0 : 1)}k` : String(km));

/** The mileage readings over time as a rising line. A drop would show as a dip, marked in red. */
export function MileageChart({ readings }: { readings: Reading[] }) {
  if (readings.length < 2) return null;
  const t0 = Date.parse(readings[0]!.at), t1 = Date.parse(readings.at(-1)!.at);
  const maxKm = Math.max(...readings.map((r) => r.km));
  const top = Math.ceil((maxKm * 1.1) / 10_000) * 10_000 || 10_000;
  const x = (at: string) => PAD.l + ((Date.parse(at) - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (km: number) => H - PAD.b - (km / top) * (H - PAD.t - PAD.b);
  const pts = readings.map((r) => [x(r.at), y(r.km)] as const);
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  const area = `${line} L${pts.at(-1)![0].toFixed(1)},${H - PAD.b} L${pts[0]![0].toFixed(1)},${H - PAD.b} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const label = `Mileage readings from ${formatDate(readings[0]!.at)} (${short(readings[0]!.km)} km) to ${formatDate(readings.at(-1)!.at)} (${short(readings.at(-1)!.km)} km).`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id="km-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bff100" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#bff100" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray="4 4" />
          <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="13" fill="var(--color-label)">{short(t)}</text>
        </g>
      ))}
      <path d={area} fill="url(#km-fill)" />
      <path d={line} fill="none" stroke="var(--color-primary-container)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {readings.map((r, i) => {
        const [cx, cy] = pts[i]!;
        const drop = i > 0 && r.km < readings[i - 1]!.km;
        const last = i === readings.length - 1;
        return (
          <g key={`${r.at}-${i}`}>
            <circle cx={cx} cy={cy} r={last ? 7 : 5} fill={drop ? '#dc2626' : last ? '#bff100' : 'var(--color-card)'} stroke={drop ? '#dc2626' : 'var(--color-primary-container)'} strokeWidth="3" />
            {(i === 0 || last || readings.length <= 6) && (
              <text x={cx} y={cy - 12} textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'} fontSize="13" fontWeight="700" fill="var(--color-ink)">{short(r.km)} km</text>
            )}
          </g>
        );
      })}
      {[readings[0]!, readings.at(-1)!].map((r, i) => (
        <text key={i} x={x(r.at)} y={H - 12} textAnchor={i ? 'end' : 'start'} fontSize="13" fontWeight="600" fill="var(--color-muted)">{formatDate(r.at, 'month')}</text>
      ))}
    </svg>
  );
}
