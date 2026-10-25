// The one list of workspaces, their modules and pages, and who may see each (navigation plan, 25 Oct 2026).
// The website's side bar, its phone menu and the top bar's workspace name all come from here, and so do the garage
// app's side bar and tabs (its pages are "#/…" addresses); the super admin's "Roles and access" screen will
// switch these modules per role.
// Hiding a link is a convenience only: the API checks every action again.

export type WorkspaceKey = 'console' | 'dealer' | 'garage' | 'inspect';

/** Who may see an entry. Every listed condition must hold; an empty rule means everyone in the workspace. */
export interface NavRule {
  /** Any one of these platform roles (SAZO staff). */
  platformRoles?: string[];
  /** Any one of these roles in the business whose workspace this is. */
  orgRoles?: string[];
  /** Only once SAZO has approved the business (a dealer waiting for approval prepares stock privately first). */
  approvedOnly?: boolean;
}

export interface NavLink {
  key: string;
  label: string;
  /** One short word under the icon when the side bar is narrow. */
  short: string;
  /** An icon name from the website's icon set (checked by a test). */
  icon: string;
  /** "{org}" is replaced with the business's id. May carry a query (?show=sold) or a section (#team). */
  href: string;
  /** Other paths that belong to this page, as prefixes ("/dealer/{org}/car/"). */
  alsoActive?: string[];
  rule?: NavRule;
}

export interface NavGroup {
  key: string;
  label: string;
  short: string;
  icon: string;
  links: NavLink[];
}

export type NavEntry = NavLink | NavGroup;
export const isGroup = (e: NavEntry): e is NavGroup => 'links' in e;

/** Opens the person's notifications inside the page they are on (the frame reads ?panel=notifications). */
export const NOTIFICATIONS_PANEL = 'notifications';
/** Opens the person's settings inside the page they are on (?panel=settings). */
export const SETTINGS_PANEL = 'settings';
export const FRAME_PANELS = [NOTIFICATIONS_PANEL, SETTINGS_PANEL] as const;

/** Settings, at the foot of every side bar and in the My SAZO menu. */
export const SETTINGS_LINK: NavLink = { key: 'settings', label: 'Settings', short: 'Settings', icon: 'edit', href: `?panel=${SETTINGS_PANEL}` };

/**
 * "My SAZO": a signed-in person's own things, in a dropdown on pages without a side bar (approved 25 Oct
 * 2026). Settings and Sign out come last. Who sees which item will be refined later; for now everyone signed in.
 */
export const MY_SAZO: NavLink[] = [
  { key: 'my-cars', label: 'My cars', short: 'My cars', icon: 'key', href: '/my-cars' },
  { key: 'saved', label: 'Saved cars', short: 'Saved', icon: 'bookmark', href: '/saved' },
  { key: 'inspections', label: 'Inspections', short: 'Inspections', icon: 'fact_check', href: '/inspections' },
  { key: 'shares', label: 'Shared reports', short: 'Shared', icon: 'share', href: '/shares' },
];
const NOTIFICATIONS: NavLink = { key: 'notifications', label: 'Notifications', short: 'Alerts', icon: 'notifications', href: `?panel=${NOTIFICATIONS_PANEL}` };

export interface Workspace {
  key: WorkspaceKey;
  /** Shown in the top bar, e.g. "SAZO console" or "Dealer". */
  label: string;
  /** Paths that belong to this workspace (the top bar uses them to name it). */
  paths: string[];
  entries: NavEntry[];
}

const STAFF = { platformRoles: ['sazo_admin', 'sazo_reviewer'] };
const ADMIN = { platformRoles: ['sazo_admin'] };
const MANAGER = { orgRoles: ['org_manager'] };
const MANAGER_APPROVED = { orgRoles: ['org_manager'], approvedOnly: true };
const APPROVED = { approvedOnly: true };

export const WORKSPACES: Record<WorkspaceKey, Workspace> = {
  console: {
    key: 'console', label: 'SAZO console', paths: ['/admin'],
    entries: [
      { key: 'overview', label: 'Overview', short: 'Overview', icon: 'list_alt', href: '/admin', rule: STAFF },
      { ...NOTIFICATIONS, rule: STAFF },
      { key: 'accounts', label: 'Accounts', short: 'Accounts', icon: 'group', links: [
        { key: 'businesses', label: 'Businesses', short: 'Businesses', icon: 'garage', href: '/admin/organisations', rule: STAFF },
        { key: 'identity', label: 'ID checks', short: 'IDs', icon: 'badge', href: '/admin/identity', rule: STAFF },
        { key: 'brokers', label: 'Brokers', short: 'Brokers', icon: 'handshake', href: '/admin/brokers', rule: STAFF },
        { key: 'ownership', label: 'Ownership claims', short: 'Owners', icon: 'key', href: '/admin/ownership', rule: STAFF },
        { key: 'people', label: "People's data", short: 'Data', icon: 'person', href: '/admin/people', rule: ADMIN },
      ] },
      { key: 'cars', label: 'Cars and records', short: 'Cars', icon: 'directions_car', links: [
        { key: 'matches', label: 'Vehicle matches', short: 'Matches', icon: 'directions_car', href: '/admin/matches', rule: STAFF },
        { key: 'conflicts', label: 'Conflicts', short: 'Conflicts', icon: 'warning', href: '/admin/conflicts', rule: STAFF },
        { key: 'concerns', label: 'Reported problems', short: 'Problems', icon: 'report', href: '/admin/concerns', rule: STAFF },
        { key: 'sources', label: 'Data sources', short: 'Sources', icon: 'account_balance', href: '/admin/sources', rule: STAFF },
        { key: 'rebuild', label: 'Recalculate', short: 'Recalc', icon: 'history', href: '/admin/rebuild', rule: STAFF },
        { key: 'send', label: 'Send records', short: 'Send', icon: 'receipt_long', href: '/partner', rule: STAFF },
      ] },
      { key: 'content', label: 'Messages and content', short: 'Messages', icon: 'forum', links: [
        { key: 'moderation', label: 'Reviews and videos', short: 'Reviews', icon: 'forum', href: '/admin/moderation', rule: STAFF },
        { key: 'announcements', label: 'Announcements', short: 'News', icon: 'notifications', href: '/admin/announcements', rule: STAFF },
        { key: 'faqs', label: 'Help answers', short: 'Help', icon: 'help_center', href: '/admin/faqs', rule: STAFF },
      ] },
    ],
  },
  // The garage app (step 3, 25 Oct 2026). Its pages are hash addresses; Alerts are jobs that need the garage.
  garage: {
    key: 'garage', label: 'SAZO Garage', paths: [],
    entries: [
      { key: 'home', label: 'Home', short: 'Home', icon: 'home', href: '#/' },
      NOTIFICATIONS,
      { key: 'records', label: 'Job records', short: 'Records', icon: 'receipt_long', href: '#/records', alsoActive: ['#/job/', '#/jobs/'] },
      { key: 'alerts', label: 'Alerts', short: 'Alerts', icon: 'warning', href: '#/alerts' },
      { key: 'concerns', label: 'Report a problem', short: 'Report', icon: 'flag', href: '#/concerns' },
      { key: 'team', label: 'Team', short: 'Team', icon: 'group', href: '#/staff', rule: MANAGER },
    ],
  },
  inspect: {
    key: 'inspect', label: 'SAZO Inspect', paths: [],
    entries: [
      { key: 'home', label: 'Inspections', short: 'Home', icon: 'fact_check', href: '#/', alsoActive: ['#/inspection/', '#/inspections/'] },
      NOTIFICATIONS,
      { key: 'concerns', label: 'Report a problem', short: 'Report', icon: 'flag', href: '#/concerns' },
      { key: 'team', label: 'Team', short: 'Team', icon: 'group', href: '#/staff', rule: MANAGER },
    ],
  },
  dealer: {
    key: 'dealer', label: 'Dealer', paths: ['/dealer/'],
    entries: [
      { key: 'stock', label: 'Cars for sale', short: 'For sale', icon: 'storefront', href: '/dealer/{org}', alsoActive: ['/dealer/{org}/car/'] },
      NOTIFICATIONS,
      { key: 'import', label: 'Add many cars', short: 'Add many', icon: 'upload_file', href: '/dealer/{org}/import', rule: MANAGER_APPROVED },
      { key: 'enquiries', label: 'Enquiries', short: 'Enquiries', icon: 'forum', href: '/dealer/{org}/enquiries', rule: APPROVED },
      { key: 'commissions', label: 'Commission', short: 'Commission', icon: 'payments', href: '/dealer/{org}/commissions', rule: MANAGER_APPROVED },
      { key: 'sold', label: 'Sold', short: 'Sold', icon: 'sell', href: '/dealer/{org}?show=sold', rule: APPROVED },
      { key: 'team', label: 'Team', short: 'Team', icon: 'group', href: '/dealer/{org}#staff-section', rule: MANAGER_APPROVED },
      { key: 'business-settings', label: 'Business settings', short: 'Business', icon: 'checklist', href: '/dealer/{org}#settings-section', rule: MANAGER },
      { key: 'business', label: 'Business details', short: 'Business', icon: 'verified_user', href: '/business/{org}' },
    ],
  },
};

export interface Viewer { platformRoles: string[]; orgRole?: string; /** The business is approved (assumed when not given). */ approved?: boolean }

const allowed = (rule: NavRule | undefined, who: Viewer) =>
  (!rule?.platformRoles || rule.platformRoles.some((r) => who.platformRoles.includes(r)))
  && (!rule?.orgRoles || (!!who.orgRole && rule.orgRoles.includes(who.orgRole)))
  && (!rule?.approvedOnly || who.approved !== false);

/** The entries this person may see, with "{org}" filled in. Groups left empty are dropped. */
export function navFor(key: WorkspaceKey, who: Viewer, org?: string): NavEntry[] {
  const fill = (l: NavLink): NavLink => ({
    ...l, href: l.href.replaceAll('{org}', org ?? ''), alsoActive: l.alsoActive?.map((p) => p.replaceAll('{org}', org ?? '')),
  });
  const out: NavEntry[] = [];
  for (const e of WORKSPACES[key].entries) {
    if (isGroup(e)) {
      const links = e.links.filter((l) => allowed(l.rule, who)).map(fill);
      if (links.length) out.push({ ...e, links });
    } else if (allowed(e.rule, who)) out.push(fill(e));
  }
  return out;
}

/**
 * The link a page belongs to: the one whose path and query best match (Sold beats Cars for sale on
 * ?show=sold), else one whose other paths contain it. Links to a #section never count (the garage app's
 * "#/…" pages do).
 */
/** A page's query, read by key (URLSearchParams fits). */
export interface QueryReader { get(key: string): string | null }

export function activeKey(entries: NavEntry[], pathname: string, search: QueryReader): string | undefined {
  let best: { key: string; score: number } | undefined;
  for (const l of entries.flatMap((e) => (isGroup(e) ? e.links : [e]))) {
    if ((l.href.includes('#') && !l.href.startsWith('#/')) || l.href.startsWith('?')) continue; // a page's #section, or a panel
    if (search.get('panel') === NOTIFICATIONS_PANEL) return NOTIFICATIONS.key;
    if (search.get('panel') === SETTINGS_PANEL) return SETTINGS_LINK.key;
    const [path, query] = l.href.split('?');
    const want = (query ?? '').split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent) as [string, string]);
    let score = 0;
    if (path === pathname && want.every(([k, v]) => search.get(k) === v)) score = 2 + want.length;
    else if (l.alsoActive?.some((p) => pathname.startsWith(p))) score = 1;
    if (score && (!best || score > best.score)) best = { key: l.key, score };
  }
  return best?.key;
}

/** The workspace a path belongs to, for the top bar. */
export function workspaceOf(pathname: string): Workspace | undefined {
  return Object.values(WORKSPACES).find((w) => w.paths.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`)));
}
