import { Icon } from '../components/icon';
import { ThemePicker } from '../components/theme-picker';
import { go } from '../lib/route';
import { isInspector, type Garage, type Me } from '../lib/types';

/** Phones: the rest of the menu. */
export function More({ garage, me, onSignOut, onSwitch }: { garage: Garage; me: Me; onSignOut: () => void; onSwitch?: () => void }) {
  return (
    <div className="space-y-4 p-4">
      <div className="card p-4">
        <p className="font-display text-lg font-bold">{garage.name}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-ok-text"><Icon name="verified_user" size={16} />Approved by SAZO</p>
        <p className="mt-2 text-sm text-muted">Signed in as {me.displayName}</p>
      </div>
      <div className="card p-4"><ThemePicker /></div>
      <div className="flex flex-col gap-2">
        {garage.role === 'org_manager' && <button type="button" className="btn btn-ghost !justify-start" onClick={() => go({ name: 'staff' })}><Icon name="group" />Team</button>}
        {isInspector(garage) || <button type="button" className="btn btn-ghost !justify-start" onClick={() => go({ name: 'concerns' })}><Icon name="flag" />Report a problem with a car</button>}
        {onSwitch && <button type="button" className="btn btn-ghost !justify-start" onClick={onSwitch}><Icon name="swap_horiz" />Switch business</button>}
        <button type="button" className="btn btn-ghost !justify-start" onClick={onSignOut}><Icon name="logout" />Sign out</button>
      </div>
    </div>
  );
}
