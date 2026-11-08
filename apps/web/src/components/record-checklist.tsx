// What SAZO records show, as a checklist (8 Nov 2026): one row per buyer question. The box is ticked when the records
// agree, has an exclamation mark when something is worth a closer look (orange) or serious (red), and stays empty
// when SAZO has no records yet, so missing data never looks like a pass. The boxes only show; nothing is clicked.
import { QUESTION_TITLES, statusLabel } from '@sazo/contracts';
import type { QuestionView, Status } from '@/lib/types';

const TONE: Record<Status, { box: string; text: string }> = {
  verified: { box: 'border-ok-text bg-ok-text', text: 'text-ok-text' },
  attention: { box: 'border-warn-text bg-warn-text', text: 'text-warn-text' },
  serious: { box: 'border-bad-text bg-bad-text', text: 'text-bad-text' },
  not_available: { box: 'border-label bg-transparent', text: 'text-muted' },
};

function Box({ status }: { status: Status }) {
  return (
    <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border-2 ${TONE[status].box}`}>
      {status === 'verified' && <svg viewBox="0 0 20 20" className="h-4 w-4"><path d="M5 10.5l3.2 3.2L15 7" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {(status === 'attention' || status === 'serious') && <svg viewBox="0 0 20 20" className="h-4 w-4"><path d="M10 4.5v6.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><circle cx="10" cy="15" r="1.5" fill="#fff" /></svg>}
    </span>
  );
}

export function RecordChecklist({ questions, className = '' }: { questions: QuestionView[]; className?: string }) {
  return (
    <ul className={`flex flex-col divide-y divide-line rounded-xl border border-line bg-card ${className}`}>
      {questions.map((q) => (
        <li key={q.question} className="flex min-h-12 flex-1 items-center gap-3 px-3 py-2.5">
          <Box status={q.status} />
          <span className="min-w-0 flex-1 font-semibold">{QUESTION_TITLES[q.question]?.short ?? q.question}</span>
          <span className={`shrink-0 text-right text-sm font-semibold ${TONE[q.status].text}`}>{statusLabel(q.question, q.status)}</span>
        </li>
      ))}
    </ul>
  );
}
