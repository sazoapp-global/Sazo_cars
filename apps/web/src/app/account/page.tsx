import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/api';
import { AccountSettings, type SettingsQuery } from './settings-view';

export const metadata: Metadata = { title: 'Your account', robots: { index: false } };

/** Settings as a page of its own, for links from emails and texts. Inside SAZO, Settings opens in the page you are on. */
export default async function Account({ searchParams }: { searchParams: Promise<SettingsQuery> }) {
  if (!(await isSignedIn())) redirect('/sign-in?next=/account');
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <AccountSettings sp={await searchParams} back="/account" />
    </div>
  );
}
