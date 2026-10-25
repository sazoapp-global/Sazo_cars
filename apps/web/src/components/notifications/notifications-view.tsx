'use client';
// Notifications shown inside the page you are on (25 Oct 2026): in the white space of a workspace page, or in a
// pop-up on other pages. Nothing opens a new page.
import { formatDate } from '@sazo/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { loadNotifications, markNotificationsRead, type Notice } from '@/app/notifications/actions';

export function NotificationsView() {
  const router = useRouter();
  const [items, setItems] = useState<Notice[] | null | undefined>();
  const [pending, start] = useTransition();
  useEffect(() => { void loadNotifications().then((r) => setItems(r?.items ?? null)); }, []);
  const unread = (items ?? []).filter((i) => !i.read).map((i) => i.id);
  const markAll = () => start(async () => {
    await markNotificationsRead(unread);
    setItems((xs) => xs?.map((x) => ({ ...x, read: true })));
    router.refresh(); // the counts on the bell and in the side bar
  });

  if (items === undefined) return <div className="skeleton h-40" />;
  if (items === null) return <p>Could not load your notifications. Try again.</p>;
  if (!items.length) return <p className="text-muted">Nothing from SAZO yet.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card" aria-label="Messages from SAZO">
        {items.map((a) => (
          <li key={a.id} className={`p-4 ${a.read ? '' : 'bg-soft'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold">{!a.read && <span className="chip border-primary-container bg-primary-container text-white">New</span>}{a.title}</p>
              <span className="text-sm text-muted">{formatDate(a.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>
          </li>
        ))}
      </ul>
      {unread.length > 0 && <button type="button" onClick={markAll} disabled={pending} className="link text-sm font-semibold">{pending ? 'Marking…' : 'Mark all as read'}</button>}
    </div>
  );
}
