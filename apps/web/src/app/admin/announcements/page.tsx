import { formatDate } from '@sazo/contracts';
import { sendAnnouncement, withdrawAnnouncement } from '../actions';
import { AUDIENCES, audienceLabel } from '../audiences';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

interface Announcement { id: string; audience: string; title: string; body: string; createdAt: string; withdrawnAt: string | null; reads: number }

/** A-06: messages from SAZO to everyone or to one group, shown under the bell. */
export default async function Announcements({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/announcements');
  const sp = await searchParams;
  const data = await adminFetch<{ items: Announcement[] }>('/admin/announcements');
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Announcements</h1>
      <p className="mb-4 max-w-2xl text-muted">A short message for everyone or for one group. It shows under the bell for the people it is for. You can withdraw it later; it is never edited.</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="sending announcements" /> : (
        <>
          <form action={sendAnnouncement} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2">
            <div><label htmlFor="audience" className="label">Who is it for?</label>
              <select id="audience" name="audience" className="field" defaultValue="everyone">{AUDIENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label htmlFor="title" className="label">Title</label><input id="title" name="title" required minLength={3} maxLength={120} className="field" /></div>
            <div className="sm:col-span-2"><label htmlFor="body" className="label">Message</label><textarea id="body" name="body" required minLength={3} maxLength={2000} rows={4} className="field" /></div>
            <div className="sm:col-span-2"><button className="btn btn-primary">Send</button></div>
          </form>
          {data.items.length === 0 ? <p className="text-muted">Nothing sent yet.</p> : (
            <ul className="space-y-3" aria-label="Sent announcements">
              {data.items.map((a) => (
                <li key={a.id} className="card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-lg font-bold">{a.title}</h2>
                    <span className="text-sm text-muted">{audienceLabel(a.audience)} · {formatDate(a.createdAt)} · read by {a.reads}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>
                  {a.withdrawnAt ? <p className="mt-2 text-sm font-semibold text-muted">Withdrawn {formatDate(a.withdrawnAt)}</p> : (
                    <form action={withdrawAnnouncement} className="mt-2"><input type="hidden" name="id" value={a.id} /><button className="link text-sm">Withdraw</button></form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
