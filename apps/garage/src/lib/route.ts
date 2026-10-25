// Tiny hash router: #/ · #/records · #/alerts · #/more · #/job/<id> · #/jobs/<id> (submitted, read-only) · #/inspection/<id> · #/inspections/<id> · #/staff.
// The phone's back button works.
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'records' } | { name: 'alerts' } | { name: 'more' } | { name: 'job'; jobId: string } | { name: 'server-job'; jobId: string } | { name: 'staff' }
  | { name: 'inspection'; id: string } | { name: 'server-inspection'; id: string } | { name: 'concerns' };

function parse(hash: string): Route {
  const [, a, b] = hash.replace(/^#/, '').split('?')[0]!.split('/');
  if (a === 'job' && b) return { name: 'job', jobId: b };
  if (a === 'jobs' && b) return { name: 'server-job', jobId: b };
  if (a === 'staff') return { name: 'staff' };
  if (a === 'records') return { name: 'records' };
  if (a === 'alerts') return { name: 'alerts' };
  if (a === 'more') return { name: 'more' };
  if (a === 'concerns') return { name: 'concerns' };
  if (a === 'inspection' && b) return { name: 'inspection', id: b };
  if (a === 'inspections' && b) return { name: 'server-inspection', id: b };
  return { name: 'home' };
}

export function go(route: Route, replace = false): void {
  const hash = route.name === 'job' ? `#/job/${route.jobId}` : route.name === 'server-job' ? `#/jobs/${route.jobId}`
    : route.name === 'inspection' ? `#/inspection/${route.id}` : route.name === 'server-inspection' ? `#/inspections/${route.id}`
    : route.name === 'home' ? '#/' : `#/${route.name}`;
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

// Panels (25 Oct 2026): Notifications and Settings open inside the page you are on ("#/records?panel=settings")
// and Close brings the page back. Moving to another page closes them.
export type Panel = 'notifications' | 'settings';

const panelOf = (hash: string): Panel | undefined => {
  const p = new URLSearchParams(hash.split('?')[1] ?? '').get('panel');
  return p === 'notifications' || p === 'settings' ? p : undefined;
};

export function openPanel(panel: Panel): void {
  location.hash = `${location.hash.split('?')[0] || '#/'}?panel=${panel}`;
}

export function closePanel(): void {
  location.hash = location.hash.split('?')[0] || '#/';
}

export function usePanel(): Panel | undefined {
  const [panel, setPanel] = useState(() => panelOf(location.hash));
  useEffect(() => {
    const on = () => setPanel(panelOf(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return panel;
}

/** The address of the page you are on without its panel, as the navigation list writes it ("#/records"). */
export const pagePath = () => (location.hash.split('?')[0] || '#/').replace(/^#$/, '#/');
