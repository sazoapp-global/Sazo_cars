// Tiny hash router: #/ · #/job/<id> · #/jobs/<id> (submitted, read-only) · #/inspection/<id> · #/inspections/<id> · #/staff. The phone's back button works.
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'job'; jobId: string } | { name: 'server-job'; jobId: string } | { name: 'staff' }
  | { name: 'inspection'; id: string } | { name: 'server-inspection'; id: string };

function parse(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('/');
  if (a === 'job' && b) return { name: 'job', jobId: b };
  if (a === 'jobs' && b) return { name: 'server-job', jobId: b };
  if (a === 'staff') return { name: 'staff' };
  if (a === 'inspection' && b) return { name: 'inspection', id: b };
  if (a === 'inspections' && b) return { name: 'server-inspection', id: b };
  return { name: 'home' };
}

export function go(route: Route, replace = false): void {
  const hash = route.name === 'job' ? `#/job/${route.jobId}` : route.name === 'server-job' ? `#/jobs/${route.jobId}` : route.name === 'staff' ? '#/staff'
    : route.name === 'inspection' ? `#/inspection/${route.id}` : route.name === 'server-inspection' ? `#/inspections/${route.id}` : '#/';
  if (replace) location.replace(hash);
  else location.hash = hash;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => { setRoute(parse(location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
