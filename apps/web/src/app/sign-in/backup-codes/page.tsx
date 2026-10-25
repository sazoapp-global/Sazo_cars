import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/phone';
import { freshBackupCodes } from '@/lib/session';
import { backupCodesSaved } from '../actions';

export const metadata: Metadata = { title: 'Your backup codes', robots: { index: false } };

/** Ten one-time codes for a lost phone, shown once right after the app is set up (D-145). */
export default async function BackupCodes({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const codes = await freshBackupCodes();
  if (!codes?.length) redirect(next);
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-bold">Save your backup codes</h1>
        <p className="mt-1 text-muted">If you lose the phone with your authenticator app, log in with one of these instead. Each works once. This is the only time SAZO shows them.</p>
        <ul aria-label="Backup codes" className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-soft p-3 font-mono text-base tracking-wider">
          {codes.map((c) => <li key={c} className="text-center">{c}</li>)}
        </ul>
        <p className="mt-3 text-sm text-muted">Write them down or print this page, and keep them somewhere safe away from your phone.</p>
        <form action={backupCodesSaved} className="mt-5">
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn btn-primary w-full">I have saved them</button>
        </form>
      </div>
    </div>
  );
}
