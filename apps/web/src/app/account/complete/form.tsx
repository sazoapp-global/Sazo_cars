'use client';
import { useActionState } from 'react';
import { PersonFields, type PersonValues } from '@/components/person-fields';
import { completeDetails, type CompleteState } from './actions';

export function CompleteForm({ next, values }: { next: string; values: PersonValues }) {
  const [state, action, pending] = useActionState<CompleteState, FormData>(completeDetails, { values });
  return (
    <form action={action} data-draft="complete-details" className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <PersonFields values={state.values} errors={state.errors} />
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Saving…' : 'Save and continue'}</button>
    </form>
  );
}
