import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api, isSignedIn } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import type { Me } from '@/lib/types';
import { CompleteForm } from './form';

export const metadata: Metadata = { title: 'Finish your details', robots: { index: false } };

/** Accounts made before 11 Oct 2026 give the details now required (D-101): names, gender, date of birth (18+). */
export default async function CompleteDetails({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const [me, p] = await Promise.all([
    api<Me>('/me', { auth: true }),
    api<{ surname: string | null; firstName: string | null; middleName: string | null }>('/me/profile', { auth: true }),
  ]);
  if (!me.needsDetails.length) redirect(next);
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Finish your details</h1>
        <p className="mt-1 text-muted">SAZO now asks everyone for their full name, gender and date of birth. It takes a minute and you only do it once.</p>
        <CompleteForm next={next} values={{ surname: p.surname ?? '', firstName: p.firstName ?? '', middleName: p.middleName ?? '' }} />
      </div>
    </div>
  );
}
