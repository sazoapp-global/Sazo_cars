import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/auth/auth-page';
import { isSignedIn } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import { googleEnabled } from '@/lib/session';
import { LoginPanel } from './login-panel';

export const metadata: Metadata = { title: 'Sign in' };

/** Messages shown after other pages send people here (fixed texts: nothing from the address is shown). */
const DONE: Record<string, string> = { password_reset: 'Your password has been changed. Log in with the new one.' };
const GOOGLE: Record<string, string> = {
  unavailable: 'Google sign-in is not available right now. Use your mobile number or email.', expired: 'That took too long. Try Google again.',
  cancelled: 'Google sign-in was cancelled.', failed: 'Google sign-in did not work. Try again, or use your mobile number or email.', inactive: 'This account is not active. Contact SAZO.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; done?: string; google?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await isSignedIn()) redirect(next);
  const notice = (sp.done === 'idle' && <p role="alert" className="mt-5 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm font-semibold text-warn-text">You were logged out after 4 hours without activity. Log in again to carry on.</p>)
    || (sp.done && DONE[sp.done] && <p role="status" className="mt-5 rounded-lg border border-ok-line bg-ok-fill p-3 text-sm font-semibold text-ok-text">{DONE[sp.done]}</p>)
    || (sp.google && GOOGLE[sp.google] && <p role="alert" className="mt-5 rounded-lg border border-warn-line bg-warn-fill p-3 text-sm font-semibold text-warn-text">{GOOGLE[sp.google]}</p>) || null;
  return (
    <AuthPage notice={notice}>
      <LoginPanel next={next} google={await googleEnabled()} />
    </AuthPage>
  );
}
