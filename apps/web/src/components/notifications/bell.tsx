'use client';
// The bell in the top bar. In a workspace it opens Notifications in the page's white space (like the side
// bar's Notifications); elsewhere it opens them in a pop-up. Either way the page stays.
import { NOTIFICATIONS_PANEL, workspaceOf } from '@sazo/contracts';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Popup } from '@/components/popup';
import { NotificationsView } from './notifications-view';

export function Bell({ unread }: { unread: number }) {
  const pathname = usePathname() ?? '';
  const search = useSearchParams();
  const label = unread ? `Notifications, ${unread} new` : 'Notifications';
  const dot = unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-bad-text px-1 text-center text-[11px] font-bold leading-[18px] text-white" aria-hidden>{unread > 9 ? '9+' : unread}</span>;
  const cls = 'relative rounded-lg p-2 text-muted hover:text-primary-container';
  if (workspaceOf(pathname)) {
    const q = new URLSearchParams(search?.toString() ?? '');
    q.set('panel', NOTIFICATIONS_PANEL);
    return <Link href={`${pathname}?${q}`} className={cls} aria-label={label}><Icon name="notifications" size={22} />{dot}</Link>;
  }
  return (
    <Popup title="Notifications" buttonLabel={label} buttonClassName={cls} button={<><Icon name="notifications" size={22} />{dot}</>}>
      <NotificationsView />
    </Popup>
  );
}
