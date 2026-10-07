import { QUESTION_TITLES, QUESTION_ORDER, headline, statusLabel, summaryLine } from '@sazo/contracts';
import type { QuestionView } from '@/lib/types';
import { StatusChip } from './status';

/** One buyer question: number, the user's own wording, status (icon + word), and one plain line. */
export function QuestionCard({ q, detailed, children }: { q: QuestionView; detailed: boolean; children?: React.ReactNode }) {
  const n = QUESTION_ORDER.indexOf(q.question as (typeof QUESTION_ORDER)[number]) + 1;
  const title = QUESTION_TITLES[q.question];
  return (
    <article className="card p-4 md:p-5" aria-labelledby={`q-${q.question}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-label">{n} · {title?.short}</p>
          <h2 id={`q-${q.question}`} className="mt-0.5 font-display text-lg font-semibold">{title?.ask}</h2>
        </div>
        <span className="shrink-0"><StatusChip status={q.status} label={statusLabel(q.question, q.status)} /></span>
      </div>
      <p className="mt-2 text-[15px]">{detailed ? headline(q.headlineKey, q.params) : summaryLine(q.headlineKey)}</p>
      {detailed && q.notes && q.notes.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-soft-3 pl-3 text-sm text-muted">
          {q.notes.map((note) => <li key={note.key}>{headline(note.key, note.params)}</li>)}
        </ul>
      )}
      {children}
    </article>
  );
}
