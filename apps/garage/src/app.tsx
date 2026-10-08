import { useCallback, useEffect, useState } from 'react';
import { Icon } from './components/icon';
import { OfflineError, onAuthChange, request, restoreSession, signOut } from './lib/api';
import { kv, wipe } from './lib/db';
import { go, useOnline, useRoute } from './lib/route';
import { syncAll } from './lib/sync';
import type { Me } from './lib/types';
import { Home } from './screens/home';
import { InspectionHome } from './screens/inspection-home';
import { InspectionWizard } from './screens/inspection-wizard';
import { ServerInspectionView } from './screens/server-inspection';
import { JobWizard } from './screens/job-wizard';
import { ServerJobView } from './screens/server-job';
import { SignIn } from './screens/sign-in';
import { Staff } from './screens/staff';
import { UpdateBanner } from './components/update-banner';

import { isInspector, WORKPLACE_TYPES, type Garage } from './lib/types';
export type { Garage };
type Session = { state: 'loading' } | { state: 'signed_out' } | { state: 'ready'; me: Me; garages: Garage[]; pending: string[] };

export function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' });
  const [garageId, setGarageId] = useState<string | undefined>();
  const online = useOnline();
  const route = useRoute();

  const load = useCallback(async () => {
    const restored = await restoreSession();
    if (restored === 'signed_out') { setSession({ state: 'signed_out' }); return; }
    let me: Me | undefined;
    try {
      me = await request<Me>('/me');
      await kv.set('me', me);
    } catch (err) {
      if (!(err instanceof OfflineError)) throw err;
      me = await kv.get<Me>('me'); // no signal: use what we knew last time
    }
    if (!me) { setSession({ state: 'signed_out' }); return; }
    const garageMemberships = me.memberships.filter((m) => WORKPLACE_TYPES.includes(m.organisationType) && m.status === 'active');
    const garages = garageMemberships.filter((m) => m.organisationStatus === 'approved').map((m) => ({ id: m.organisationId, name: m.organisationName, role: m.role, type: m.organisationType }));
    const pending = garageMemberships.filter((m) => m.organisationStatus !== 'approved').map((m) => m.organisationName);
    setSession({ state: 'ready', me, garages, pending });
    const saved = await kv.get<string>('garageId');
    setGarageId(garages.find((g) => g.id === saved)?.id ?? (garages.length === 1 ? garages[0]!.id : undefined));
  }, []);

  useEffect(() => { void load(); return onAuthChange((signedIn) => { if (!signedIn) setSession({ state: 'signed_out' }); }); }, [load]);
  // Back online → send whatever is waiting on the phone.
  useEffect(() => { if (online && garageId) void syncAll(garageId); }, [online, garageId]);

  const leave = async () => { await signOut(); await wipe(); setGarageId(undefined); setSession({ state: 'signed_out' }); go({ name: 'home' }, true); };

  if (session.state === 'loading') return <div className="p-6 text-muted" aria-busy="true">Loading…</div>;
  if (session.state === 'signed_out') return <SignIn onSignedIn={() => void load()} />;

  const garage = session.garages.find((g) => g.id === garageId);
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-surface">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-primary px-4 py-3 text-white">
        <button type="button" onClick={() => go({ name: 'home' })} className="min-w-0 text-left">
          <span className="block font-display text-lg font-extrabold leading-tight">{garage && isInspector(garage) ? 'SAZO Inspect' : 'SAZO Garage'}</span>
          {garage && <span className="block truncate text-sm text-white/80">{garage.name}</span>}
        </button>
        <span role="status" aria-live="polite" className={`chip !border-0 ${online ? 'bg-white/15 text-white' : 'bg-warn-fill text-warn-text'}`}>
          <Icon name={online ? 'cloud_done' : 'wifi_off'} size={14} />{online ? 'Online' : 'No signal — saving on phone'}
        </span>
      </header>
      <UpdateBanner />
      <main className="flex-1">
        {!garage ? (
          <GaragePicker session={session} onPick={async (id) => { await kv.set('garageId', id); setGarageId(id); }} onSignOut={leave} />
        ) : route.name === 'job' ? <JobWizard key={route.jobId} jobId={route.jobId} garage={garage} me={session.me} />
          : route.name === 'server-job' ? <ServerJobView jobId={route.jobId} garage={garage} />
          : route.name === 'inspection' ? <InspectionWizard key={route.id} id={route.id} workplace={garage} me={session.me} />
          : route.name === 'server-inspection' ? <ServerInspectionView id={route.id} workplace={garage} />
          : route.name === 'staff' ? <Staff garage={garage} />
          : isInspector(garage) ? <InspectionHome workplace={garage} me={session.me} onSignOut={leave} />
          : <Home garage={garage} me={session.me} onSignOut={leave} />}
      </main>
    </div>
  );
}

function GaragePicker({ session, onPick, onSignOut }: { session: Extract<Session, { state: 'ready' }>; onPick: (id: string) => void; onSignOut: () => void }) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold">Hello, {session.me.displayName}</h1>
      {session.garages.length > 1 && (
        <section aria-labelledby="pick">
          <h2 id="pick" className="font-semibold">Which business are you working for?</h2>
          <div className="mt-2 space-y-2">
            {session.garages.map((g) => <button key={g.id} type="button" className="btn btn-ghost w-full !justify-start" onClick={() => onPick(g.id)}><Icon name={isInspector(g) ? 'fact_check' : 'garage'} />{g.name}</button>)}
          </div>
        </section>
      )}
      {session.pending.map((name) => (
        <div key={name} className="card flex gap-3 p-4">
          <Icon name="hourglass_empty" className="mt-0.5 shrink-0 text-warn-text" />
          <div><p className="font-semibold">{name} is waiting for SAZO approval</p><p className="text-sm text-muted">You can record work as soon as SAZO has checked your business. We&apos;ll send an SMS.</p></div>
        </div>
      ))}
      {session.garages.length === 0 && session.pending.length === 0 && (
        <div className="card p-4">
          <p className="font-semibold">This phone number isn&apos;t part of a garage or inspection business on SAZO yet</p>
          <p className="mt-1 text-sm text-muted">Ask your manager to add you as staff, or register your business on the SAZO website.</p>
        </div>
      )}
      <button type="button" className="btn btn-ghost w-full" onClick={onSignOut}><Icon name="logout" />Sign out</button>
    </div>
  );
}
