import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GOOGLE_SIGNUP_COOKIE } from '@/lib/session';
import { GoogleSignUpForm } from './form';

export const metadata: Metadata = { title: 'Finish signing up', robots: { index: false } };

/** A new person signing up with Google gives the details SAZO needs (D-101). */
export default async function GoogleSignUp() {
  const raw = (await cookies()).get(GOOGLE_SIGNUP_COOKIE)?.value;
  if (!raw) redirect('/sign-up');
  const { suggested } = JSON.parse(raw) as { suggested: { firstName: string | null; surname: string | null; email: string | null } };
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Finish signing up</h1>
        <p className="mt-1 text-muted">{suggested.email ? <>Signing up with Google as <span className="font-semibold">{suggested.email}</span>. </> : null}Check your names and tell us the rest.</p>
        <GoogleSignUpForm values={{ surname: suggested.surname ?? '', firstName: suggested.firstName ?? '' }} />
      </div>
    </div>
  );
}
