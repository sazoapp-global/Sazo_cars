import { CONFIDENCE_LABELS } from '@sazo/contracts';
import type { RecordConfidence } from '@/lib/types';

const BARS: Record<string, number> = { insufficient: 0, low: 1, medium: 2, high: 3 };

/** Record Confidence (P-001): how complete and well-supported the history is — with its basis. */
export function Confidence({ rc }: { rc: RecordConfidence }) {
  const bars = BARS[rc.level] ?? 0;
  return (
    <div>
      <h3 className="font-display text-base font-bold">Record Confidence</h3>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex gap-1" aria-hidden>
          {[1, 2, 3].map((i) => <span key={i} className={`h-3 w-7 rounded-sm ${i <= bars ? 'bg-primary-container' : 'bg-soft-3'}`} />)}
        </div>
        <span className="font-display text-lg font-extrabold">{CONFIDENCE_LABELS[rc.level] ?? rc.level}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Based on {rc.records} {rc.records === 1 ? 'record' : 'records'} from {rc.sources} {rc.sources === 1 ? 'source' : 'sources'}
        {rc.openConflicts > 0 ? ` · ${rc.openConflicts} ${rc.openConflicts === 1 ? 'disagreement' : 'disagreements'} under review` : ''}.
      </p>
    </div>
  );
}
