'use client';
import { useActionState } from 'react';
import { withdrawRecord, type WithdrawState } from '../actions';

/** P-05: withdraw a record sent by mistake, with a reason. */
export function WithdrawForm({ source, observationId }: { source: string; observationId: string }) {
  const [state, action, pending] = useActionState<WithdrawState, FormData>(withdrawRecord, {});
  if (state.done) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-4 font-semibold text-ok-text">Withdrawn. The record stays in the car&apos;s history, marked withdrawn, and no longer counts.</p>
        <a href={`/partner/${source}?tab=records`} className="btn btn-primary">Back to records sent</a>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-3 p-4">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="observationId" value={observationId} />
      <p className="font-semibold">Withdraw this record</p>
      <p className="text-sm text-muted">Use this when the record should never have been sent, for example it was for the wrong car. To fix a detail, correct it instead. Nothing is deleted: SAZO keeps the record with your reason.</p>
      <div><label htmlFor="reason" className="label">Why are you withdrawing it? *</label>
        <textarea id="reason" name="reason" required minLength={5} maxLength={300} rows={3} className="field" /></div>
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Withdrawing…' : 'Withdraw record'}</button>
        <a href={`/partner/${source}?tab=records`} className="btn btn-ghost">Cancel</a>
      </div>
    </form>
  );
}
