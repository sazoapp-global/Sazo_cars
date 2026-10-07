import { WORK_LABELS, formatDate, formatKm } from '@sazo/contracts';
import type { Metadata } from 'next';
import { ApiError, api } from '@/lib/api';
import type { AttestationView } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { AnswerForm } from './answer-form';

export const metadata: Metadata = { title: 'Confirm a garage visit', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** Opened from the SMS (D-058). No sign-in: the single-use link is the key. Shows no costs and no names. */
export default async function Attest({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view: AttestationView | undefined;
  let problem: 'invalid' | 'expired' | undefined;
  try {
    view = await api<AttestationView>(`/attest/${encodeURIComponent(token)}`);
  } catch (err) {
    problem = err instanceof ApiError && err.status === 410 ? 'expired' : 'invalid';
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="card p-6">
        {problem ? (
          <>
            <Icon name="help" size={32} className="text-na-text" />
            <h1 className="mt-2 font-display text-xl font-bold">{problem === 'expired' ? 'This link has expired' : 'This link is not valid'}</h1>
            <p className="mt-1 text-muted">{problem === 'expired' ? 'Confirmation links work for 14 days. Nothing else is needed from you.' : 'Check that you opened the full link from the SMS.'}</p>
          </>
        ) : view && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-label">Garage visit</p>
            <h1 className="mt-1 font-display text-xl font-bold">Was this your car at {view.garageName}?</h1>
            <dl className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3"><dt className="text-muted">Car</dt><dd><Plate value={view.plate} /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Date</dt><dd className="font-semibold">{formatDate(view.eventDate)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Work</dt><dd className="text-right font-semibold">{(view.params.workTypes ?? []).map((w) => WORK_LABELS[w] ?? w).join(', ')}</dd></div>
              {view.mileageKm !== null && <div className="flex justify-between gap-3"><dt className="text-muted">Mileage</dt><dd className="font-semibold tabular-nums">{formatKm(view.mileageKm)}</dd></div>}
            </dl>
            {view.answered ? (
              <p role="status" className="mt-6 rounded-lg border border-line bg-soft p-4 text-sm">You already answered: <strong>{view.answered === 'confirmed' ? 'this was your car' : 'this is not right'}</strong>. Thank you.</p>
            ) : <AnswerForm token={token} />}
            <p className="mt-6 text-xs text-muted">SAZO keeps vehicle histories so buyers can check a car. Your answer is linked to this visit only; we never show your name or number to anyone.</p>
          </>
        )}
      </div>
    </div>
  );
}
