'use client';
import { useActionState, useState } from 'react';
import { answer, type AnswerState } from './actions';

export function AnswerForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AnswerState, FormData>(answer, {});
  const [disputing, setDisputing] = useState(false);

  if (state.done) {
    return (
      <div role="status" className={`mt-6 rounded-lg border p-4 ${state.done === 'confirmed' ? 'border-ok-line bg-ok-fill text-ok-text' : 'border-warn-line bg-warn-fill text-warn-text'}`}>
        <p className="font-semibold">{state.done === 'confirmed' ? 'Thank you — you confirmed this visit.' : 'Thank you — we have noted that you dispute this record.'}</p>
        <p className="mt-1 text-sm text-on-surface">{state.done === 'confirmed' ? 'Your answer makes this car’s history more reliable.' : 'SAZO will treat this record with caution. You don’t need to do anything else.'}</p>
      </div>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error}</p>}
      {!disputing ? (
        <>
          <button type="submit" name="response" value="confirmed" className="btn btn-primary w-full" disabled={pending}>Yes, this was my car</button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => setDisputing(true)}>No, this is not right</button>
        </>
      ) : (
        <>
          <label htmlFor="comment" className="label">What is wrong? (optional)</label>
          <textarea id="comment" name="comment" maxLength={500} rows={3} className="field !min-h-24 py-3" placeholder="e.g. My car was not at this garage on that day" />
          <button type="submit" name="response" value="disputed" className="btn btn-primary w-full" disabled={pending}>Send: this is not right</button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => setDisputing(false)}>Back</button>
        </>
      )}
    </form>
  );
}
