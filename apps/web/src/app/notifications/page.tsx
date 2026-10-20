import { formatDate } from '@sazo/contracts';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };

interface Item { id: string; title: string; body: string; createdAt: string; read: boolean }

/** The bell (A-06): announcements from SAZO for this person's groups. Opening the page marks them read. */
export default async function Notifications() {
  if (!(await isSignedIn())) redirect('/sign-in?next=/notifications');
  const { items } = await api<{ unread: number; items: Item[] }>('/me/announcements', { auth: true });
  const unread = items.filter((i) => !i.read).map((i) => i.id);
  if (unread.length) await api('/me/announcements/read', { method: 'POST', auth: true, body: { ids: unread } }).catch(() => undefined);
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Notifications</h1>
      {items.length === 0 ? <p className="text-muted">Nothing from SAZO yet.</p> : (
        <ul className="space-y-3" aria-label="Messages from SAZO">
          {items.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">{!a.read && <span className="chip border-primary-container bg-primary-container text-white">New</span>}{a.title}</h2>
                <span className="text-sm text-muted">{formatDate(a.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted"><Icon name="help_center" size={16} className="mr-1 inline align-[-3px]" />Questions? See <a href="/help" className="link">Help</a>.</p>
    </div>
  );
}
