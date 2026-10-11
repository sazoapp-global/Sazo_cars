'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { personFrom, type PersonValues } from '@/components/person-fields';
import { ApiError, api } from '@/lib/api';
import { safeNext } from '@/lib/phone';
import { fieldErrors } from '@/lib/session';

export type CompleteState = { error?: string; errors?: Record<string, string>; values?: PersonValues };

export async function completeDetails(_prev: CompleteState, form: FormData): Promise<CompleteState> {
  const details = personFrom(form);
  try {
    await api('/me/details', { method: 'PUT', auth: true, body: details });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'invalid_request') return { values: details, error: 'Check the highlighted fields.', errors: fieldErrors(err.errors) };
    if (err instanceof ApiError && err.detail) return { values: details, error: err.detail };
    return { values: details, error: 'Something went wrong. Please try again.' };
  }
  revalidatePath('/', 'layout');
  redirect(safeNext(form.get('next')));
}
