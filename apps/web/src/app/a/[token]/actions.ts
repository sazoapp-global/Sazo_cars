'use server';
import { ApiError, api } from '@/lib/api';

export type AnswerState = { done?: 'confirmed' | 'disputed'; error?: string };

export async function answer(_prev: AnswerState, form: FormData): Promise<AnswerState> {
  const token = String(form.get('token') ?? '');
  const response = form.get('response') === 'disputed' ? 'disputed' : 'confirmed';
  const comment = String(form.get('comment') ?? '').trim().slice(0, 500) || undefined;
  try {
    await api(`/attest/${encodeURIComponent(token)}`, { method: 'POST', body: { response, comment } });
    return { done: response };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return { error: 'This visit has already been answered. Thank you.' };
    if (err instanceof ApiError && err.status === 410) return { error: 'This link has expired.' };
    return { error: 'We could not save your answer. Please try again.' };
  }
}
