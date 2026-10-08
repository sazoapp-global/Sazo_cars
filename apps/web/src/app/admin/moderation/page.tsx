import { formatDate } from '@sazo/contracts';
import type { ModerationCase } from '@/lib/types';
import { decideModeration } from '../actions';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

export const metadata = { title: 'Reviews and videos' };
const STATUSES = [['open', 'Waiting'], ['approved', 'Published'], ['rejected', 'Rejected']] as const;

export default async function Moderation({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/moderation');
  const sp = await searchParams;
  const status = STATUSES.some(([s]) => s === sp.status) ? sp.status! : 'open';
  const data = await adminFetch<{ items: ModerationCase[] }>(`/admin/moderation?status=${status}`);
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Reviews and videos</h1>
      <p className="mb-4 text-muted">Publish only what is about the model in general. Reject names, phone numbers, claims about a specific car or person, adverts, and videos that are not about this model (D-063, P-008).</p>
      <Notice done={sp.done} error={sp.error} />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map(([s, label]) => (
          <a key={s} href={`/admin/moderation?status=${s}`} aria-current={s === status ? 'true' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${s === status ? 'border-primary-container bg-primary-container text-white' : 'border-line bg-white'}`}>{label}</a>
        ))}
      </nav>
      {data === 'forbidden' ? <Forbidden what="moderating reviews" /> : data.items.length === 0 ? <p className="text-muted">Nothing here.</p> : (
        <ul className="space-y-3">
          {data.items.map((c) => (
            <li key={c.caseId} className="card p-4">
              <p className="text-sm text-muted">{c.type === 'model_review' ? 'Review' : 'Video link'} · {c.model} · by {c.author}{c.verifiedOwner ? ' (verified owner)' : ''} · {formatDate(c.submittedAt)}</p>
              {c.type === 'model_review' ? (
                <><p className="mt-1 font-semibold">{c.rating} of 5</p><p className="mt-1 whitespace-pre-line">{c.body}</p></>
              ) : (
                <p className="mt-1"><span className="font-semibold">{c.title ?? 'Untitled'}</span> · {c.platform} · <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="link break-all">{c.url}</a></p>
              )}
              {status === 'open' ? (
                <form action={decideModeration} className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
                  <input type="hidden" name="id" value={c.caseId} />
                  <div className="flex-1"><label htmlFor={`r-${c.caseId}`} className="label">Reason (kept in the audit log)</label>
                    <input id={`r-${c.caseId}`} name="reason" required minLength={3} className="field" placeholder="e.g. About the model; no personal details" /></div>
                  <div className="flex gap-2">
                    <button name="decision" value="approve" className="btn btn-primary">Publish</button>
                    <button name="decision" value="reject" className="btn btn-ghost">Reject</button>
                  </div>
                </form>
              ) : c.reason && <p className="mt-2 text-sm text-muted">Reason: {c.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
