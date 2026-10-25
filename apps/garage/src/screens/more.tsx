import { Icon } from '../components/icon';
import { go, openPanel } from '../lib/route';
import { isInspector, type Garage, type Me } from '../lib/types';

/** Phones: the rest of the menu, with Settings and Sign out last (as at the foot of the side bar). */
export function More({ garage, me, onSignOut }: { garage: Garage; me: Me; onSignOut: () => void }) {
  const item = 'btn btn-ghost w-full !justify-start';
  return (
    <div className="space-y-4 p-4">
      <div className="card p-4">
        <p className="font-display text-lg font-bold">{garage.name}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-ok-text"><Icon name="verified_user" size={16} />Approved by SAZO</p>
        <p className="mt-2 text-sm text-muted">Signed in as {me.displayName}</p>
      </div>
      <nav aria-label="More" className="flex flex-col gap-2">
        <button type="button" className={item} onClick={() => openPanel('notifications')}><Icon name="notifications" />Notifications</button>
        {isInspector(garage) || <button type="button" className={item} onClick={() => go({ name: 'concerns' })}><Icon name="flag" />Report a problem with a car</button>}
        {garage.role === 'org_manager' && <button type="button" className={item} onClick={() => go({ name: 'staff' })}><Icon name="group" />Team</button>}
        <button type="button" className={item} onClick={() => openPanel('settings')}><Icon name="edit" />Settings</button>
        <button type="button" className={item} onClick={onSignOut}><Icon name="logout" />Sign out</button>
      </nav>
    </div>
  );
}
