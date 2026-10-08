import '@fontsource-variable/inter';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { api, isSignedIn } from '@/lib/api';
import type { Me } from '@/lib/types';
import { Icon } from '@/components/icon';

export const metadata: Metadata = {
  title: { default: 'SAZO — Check a car before you buy', template: '%s · SAZO' },
  description: 'Look up a vehicle by number plate or VIN and see what its records show: identity, servicing, accidents, mileage, finance and price.',
};
export const viewport: Viewport = { themeColor: '#002177', width: 'device-width', initialScale: 1 };

async function currentUser(): Promise<Me | undefined> {
  if (!(await isSignedIn())) return undefined;
  return api<Me>('/me', { auth: true }).catch(() => undefined);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  return (
    <html lang="en-UG">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        <div role="note" className="bg-ink px-4 py-2 text-center text-xs text-white/90">
          <Icon name="science" size={14} className="mr-1 inline align-[-2px]" />
          SAZO is in testing. The vehicles and records shown are simulated and do not describe real cars.
        </div>
        <header className="border-b border-line bg-white print:hidden">
          <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 md:px-8 lg:px-12">
            <Link href="/" className="font-display text-xl font-extrabold tracking-tight text-primary" aria-label="SAZO home">SAZO</Link>
            <span className="flex-1 md:hidden" />
            <nav aria-label="Main" className="mr-auto hidden gap-6 pl-4 text-sm font-semibold text-muted md:flex">
              <Link href="/" className="hover:text-primary-container">Check a car</Link>
              <Link href="/#how" className="hover:text-primary-container">How it works</Link>
              <Link href="/business" className="hover:text-primary-container">For businesses</Link>
            </nav>
            {me && (me.platformRoles.includes('sazo_admin') || me.platformRoles.includes('sazo_reviewer')) && (
              <Link href="/admin" className="text-sm font-semibold text-primary-container hover:underline">Admin</Link>
            )}
            {me && <Link href="/saved" className="text-sm font-semibold text-muted hover:text-primary-container">Saved</Link>}
            {me ? (
              <Link href="/account" className="btn btn-ghost !min-h-10 !px-3 text-sm"><Icon name="person" size={18} /><span className="max-w-[10rem] truncate">{me.displayName}</span></Link>
            ) : (
              <Link href="/sign-in" className="btn btn-ghost !min-h-10 text-sm">Sign in</Link>
            )}
          </div>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="mt-12 border-t border-line bg-white">
          <div className="mx-auto max-w-[1280px] px-4 py-6 text-sm text-muted md:px-8 lg:px-12">
            <p>SAZO describes what the available records show. It does not certify a vehicle. Always inspect a car and check its documents before you pay.</p>
            <p className="mt-2"><Link href="/business" className="link">For businesses</Link> · © {new Date().getFullYear()} SAZO</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
