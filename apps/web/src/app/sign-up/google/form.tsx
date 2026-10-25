'use client';
import { useActionState } from 'react';
import { PersonFields, type PersonValues } from '@/components/person-fields';
import { finishGoogleSignUp, type GoogleSignUpState } from './actions';

export function GoogleSignUpForm({ values }: { values: PersonValues }) {
  const [state, action, pending] = useActionState<GoogleSignUpState, FormData>(finishGoogleSignUp, { values });
  return (
    <form action={action} data-draft="sign-up-google" className="mt-6 space-y-4" noValidate>
      <PersonFields values={state.values} errors={state.errors} />
      {state.error && <p role="alert" className="text-sm font-semibold text-bad-text">{state.error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
    </form>
  );
}
