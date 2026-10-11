import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/auth/auth-page';
import { isSignedIn } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import { googleEnabled } from '@/lib/session';
import { SignUpPanel } from './form';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string; google?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await isSignedIn()) redirect(next);
  const notice = sp.google === 'expired' ? <p role="alert" className="mt-5 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm font-semibold text-warn-text">That took too long. Try Google again.</p> : null;
  return (
    <AuthPage notice={notice}>
      <SignUpPanel next={next} google={await googleEnabled()} />
    </AuthPage>
  );
}
