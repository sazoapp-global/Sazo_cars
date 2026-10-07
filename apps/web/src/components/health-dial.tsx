import { HEALTH_FACTORS } from '@sazo/contracts';
import type { FullReport } from '@/lib/types';

/** Vehicle Health (P-001): a 0–100 dial with its reasons. Too little data shows "Insufficient history", never a number. */
export function HealthDial({ health }: { health: FullReport['health'] }) {
  const score = health.insufficient ? null : health.score;
  const colour = score === null ? '#94a3b8' : score >= 80 ? '#bff100' : score >= 50 ? '#f59e0b' : '#ef4444';
  const r = 42;
  const c = 2 * Math.PI * r;
  const filled = score === null ? 0 : (score / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="#0b132b" stroke="#1e293b" strokeWidth="10" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={colour} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          {score === null ? (
            <span className="px-3 text-center text-[11px] font-semibold leading-tight">Insufficient history</span>
          ) : (
            <><span className="font-display text-3xl font-extrabold">{score}</span><span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">of 100</span></>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-base font-bold">Vehicle Health</h3>
        <p className="text-sm text-muted">{score === null ? 'Not enough records to score its condition yet.' : 'What condition the records suggest it is in.'}</p>
        {health.deductions.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm">
            {health.deductions.map((d) => (
              <li key={d.key} className="flex justify-between gap-3"><span>{HEALTH_FACTORS[d.key] ?? 'Other factor'}</span><span className="font-semibold tabular-nums text-bad-text">{d.points}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
