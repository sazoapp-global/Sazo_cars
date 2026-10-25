'use client';
// Notifications shown inside the page you are on (25 Oct 2026): in the white space of a workspace page, or in a
// pop-up on other pages. The list shows only the badge and the title; clicking one opens its full message in a
// pop-up over the page and marks it read (25 Oct 2026).
import { formatDate } from '@sazo/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { audienceLabel } from '@/app/admin/audiences';
import { loadNotifications, markNotificationsRead, type Notice } from '@/app/notifications/actions';
import { Icon } from '@/components/icon';

export function NotificationsView() {
  const router = useRouter();
  const [items, setItems] = useState<Notice[] | null | undefined>();
  const [open, setOpen] = useState<Notice>();
  const [pending, start] = useTransition();
  useEffect(() => { void loadNotifications().then((r) => setItems(r?.items ?? null)); }, []);
  const unread = (items ?? []).filter((i) => !i.read).map((i) => i.id);
  const markRead = (ids: string[]) => start(async () => {
    await markNotificationsRead(ids);
    setItems((xs) => xs?.map((x) => (ids.includes(x.id) ? { ...x, read: true } : x)));
    router.refresh(); // the counts on the bell and in the side bar
  });
  const show = (n: Notice) => {
    setOpen(n);
    if (!n.read) markRead([n.id]);
  };

  if (items === undefined) return <div className="skeleton h-40" />;
  if (items === null) return <p>Could not load your notifications. Try again.</p>;
  if (!items.length) return <p className="text-muted">Nothing from SAZO yet.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card" aria-label="Messages from SAZO">
        {items.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => show(a)} aria-haspopup="dialog"
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-soft-2 ${a.read ? '' : 'bg-soft'}`}>
              {!a.read && <span className="chip shrink-0 border-primary-container bg-primary-container text-white">New</span>}
              <span className={`min-w-0 flex-1 truncate ${a.read ? 'font-semibold text-muted' : 'font-bold text-ink'}`}>{a.title}</span>
              <Icon name="chevron_right" size={20} className="shrink-0 text-label" />
            </button>
          </li>
        ))}
      </ul>
      {unread.length > 0 && <button type="button" onClick={() => markRead(unread)} disabled={pending} className="link text-sm font-semibold">{pending ? 'Marking…' : 'Mark all as read'}</button>}
      <NoticeDialog notice={open} onClose={() => setOpen(undefined)} />
    </div>
  );
}

/** One notification in full, over the page. Closed by Close, the cross, Escape or a click outside. */
function NoticeDialog({ notice, onClose }: { notice?: Notice; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Shown as it was when opened: the NEW badge stays on while reading, even though it is now marked read.
  const [wasNew, setWasNew] = useState(false);
  useEffect(() => {
    if (notice) { setWasNew(!notice.read); if (!ref.current?.open) ref.current?.showModal(); }
    else ref.current?.close();
  }, [notice]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto w-[min(520px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/50">
      {notice && (
        <div className="p-6">
          <div className="flex items-center justify-between gap-3">
            {wasNew ? <span className="chip border-primary-container bg-primary-container text-white">New</span> : <span />}
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-soft">
              <Icon name="close" size={18} />
            </button>
          </div>
          <h2 id={titleId} className="mt-3 font-display text-xl font-bold">{notice.title}</h2>
          <p className="mt-1 text-sm text-muted">{formatDate(notice.createdAt)}</p>
          <p className="mt-4 whitespace-pre-line leading-relaxed">{notice.body}</p>
          {notice.audience && <p className="mt-4"><span className="rounded-full bg-soft px-2.5 py-1 text-xs text-muted">For {audienceLabel(notice.audience).toLowerCase()}</span></p>}
          <div className="mt-6 flex justify-end"><button type="button" onClick={() => ref.current?.close()} className="btn btn-primary">Close</button></div>
        </div>
      )}
    </dialog>
  );
}
