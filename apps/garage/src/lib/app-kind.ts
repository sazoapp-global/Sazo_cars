// Which app this phone is for before anyone logs in (28 Oct 2026): the business page opens the app with
// ?for=garage or ?for=inspect, and the phone remembers it, so an inspector is never greeted as a garage.
// Unknown (opened another way): a neutral "SAZO" until the person logs in and their business is known.
export type AppKind = 'garage' | 'inspect';
const KEY = 'sazo-app-kind';

export function appKind(): AppKind | undefined {
  try {
    const url = new URL(location.href);
    const asked = url.searchParams.get('for');
    if (asked === 'garage' || asked === 'inspect') {
      localStorage.setItem(KEY, asked);
      url.searchParams.delete('for');
      history.replaceState(history.state, '', url.toString());
      return asked;
    }
    const kept = localStorage.getItem(KEY);
    return kept === 'garage' || kept === 'inspect' ? kept : undefined;
  } catch { return undefined; }
}

export const APP_TITLE: Record<AppKind | 'any', { name: string; line: string }> = {
  garage: { name: 'SAZO Garage', line: 'Record jobs for your customers’ cars. Works without signal.' },
  inspect: { name: 'SAZO Inspect', line: 'Record car inspections step by step. Works without signal.' },
  any: { name: 'SAZO', line: 'Record garage jobs and car inspections. Works without signal.' },
};

/** Once the person's business is known, remember it for the next log-in screen on this phone. */
export function rememberAppKind(kind: AppKind) {
  try { localStorage.setItem(KEY, kind); } catch { /* private mode */ }
  document.title = APP_TITLE[kind].name;
}
