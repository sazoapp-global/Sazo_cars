import { DraftKeeper } from '@/components/draft-keeper';
import '@fontsource-variable/inter';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './globals.css';
import './theme-dark.css';
import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';
import { api, isSignedIn } from '@/lib/api';
import type { Me } from '@/lib/types';
import { Icon } from '@/components/icon';
import { AccountPopup } from './account/account-popup';
import { FrameOffset } from '@/components/app-frame/frame-offset';
import { HideIn, ShowIn } from '@/components/app-frame/hide-in';
import { OnlineStatus } from '@/components/app-frame/online-status';
import { MySazo } from '@/components/app-frame/my-sazo';
import { SitePanel } from '@/components/app-frame/site-panel';
import { TopMeasure } from '@/components/app-frame/top-measure';
import { Bell } from '@/components/notifications/bell';
import { WorkspaceName } from '@/components/app-frame/workspace-name';
import { Logo } from '@/components/logo';
import { MainNav } from '@/components/main-nav';
import { MobileNav } from '@/components/mobile-nav';

export const metadata: Metadata = {
  title: { default: 'SAZO: check a car before you buy', template: '%s · SAZO' },
  description: 'Look up a vehicle by number plate or VIN and see what its records show: identity, servicing, accidents, mileage, finance and price.',
};
export const viewport: Viewport = { themeColor: '#002177', width: 'device-width', initialScale: 1 };

async function currentUser(): Promise<Me | undefined> {
  if (!(await isSignedIn())) return undefined;
  return api<Me>('/me', { auth: true }).catch(() => undefined);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, theme] = await Promise.all([currentUser(), cookies().then((c) => parseTheme(c.get(THEME_COOKIE)?.value))]);
  const unread = me ? await api<{ unread: number }>('/me/announcements', { auth: true }).then((r) => r.unread).catch(() => 0) : 0;
  return (
    // An explicit choice is drawn by the server; "same as device" is drawn by CSS (prefers-color-scheme).
    <html lang="en-UG" {...(theme !== 'system' ? { 'data-theme': theme } : {})} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
        {/* On computers the testing note and the top bar both stay put, so the fixed side bar sits right under them. */}
        <div id="site-note" role="note" className="z-40 bg-ink px-4 py-2 text-center text-xs text-white/90 lg:sticky lg:top-0">
          <Icon name="science" size={14} className="mr-1 inline align-[-2px]" />
          <span className="sm:hidden">Testing: records are simulated, not real cars.</span>
          <span className="hidden sm:inline">SAZO is in testing. The vehicles and records shown are simulated and do not describe real cars.</span>
        </div>
        <TopMeasure targets={['site-note', 'site-header']} />
        <header id="site-header" className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md print:hidden lg:top-8">
          <div className="relative mx-auto flex h-16 max-w-[1280px] items-center gap-2 px-4 sm:gap-4 md:h-20 md:px-8 lg:px-12">
            <HideIn workspaces="all"><MobileNav signedIn={!!me} /></HideIn>
            <Logo />
            <WorkspaceName />
            {/* Workspaces have the garage app's compact top bar: no site links, the online badge instead. */}
            <div className="flex-1 md:ml-8"><HideIn workspaces="all"><MainNav /></HideIn></div>
            <ShowIn workspaces={['console', 'dealer']}><OnlineStatus /></ShowIn>
            {me && (me.platformRoles.includes('sazo_admin') || me.platformRoles.includes('sazo_reviewer')) && (
              <HideIn workspaces="all"><Link href="/admin" className="hidden text-sm font-semibold text-primary-container hover:underline sm:inline">Admin</Link></HideIn>
            )}
            {me && <HideIn workspaces="all"><Suspense><MySazo /></Suspense></HideIn>}
            {me && <Suspense><Bell unread={unread} /></Suspense>}
            <HideIn workspaces="all"><ThemeToggle /></HideIn>
            {me ? (
              <AccountPopup displayName={me.displayName} initials={me.initials} />
            ) : (
              <>
                <Link href="/sign-in" className="px-2 text-sm font-semibold text-ink hover:text-primary-container">Log in</Link>
                <Link href="/#check" className="btn btn-focal !min-h-10 hidden !px-4 text-sm shadow-sm sm:inline-flex">Check a Car<Icon name="arrow_forward" size={18} /></Link>
              </>
            )}
          </div>
        </header>
        <DraftKeeper />
        <main id="main" className="flex-1"><Suspense><SitePanel>{children}</SitePanel></Suspense></main>
        <HideIn workspaces={['console', 'dealer']}><FrameOffset>
        <footer className="mt-16 border-t border-line bg-white print:hidden">
          <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-8 lg:px-12">
            <div>
              <Logo tagline="A clearer story for every car" />
              <p className="mt-4 max-w-sm text-sm text-muted">SAZO describes what the available records show. It does not certify a vehicle. Always inspect a car and check its documents before you pay.</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-label">Check</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/#check" className="hover:text-primary-container">Check a car</Link></li>
                <li><Link href="/compare" className="hover:text-primary-container">Compare cars</Link></li>
                <li><Link href="/#how" className="hover:text-primary-container">How it works</Link></li>
                <li><Link href="/help" className="hover:text-primary-container">Help</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-label">Businesses</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/business" className="hover:text-primary-container">For businesses</Link></li>
                <li><Link href="/business/register" className="hover:text-primary-container">Register a business</Link></li>
                <li><Link href="/sign-in?next=/account" className="hover:text-primary-container">Business log-in</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-line">
            <p className="mx-auto max-w-[1280px] px-4 py-4 text-xs text-label md:px-8 lg:px-12">© {new Date().getFullYear()} SAZO · Kampala, Uganda</p>
          </div>
        </footer>
        </FrameOffset></HideIn>
      </body>
    </html>
  );
}
