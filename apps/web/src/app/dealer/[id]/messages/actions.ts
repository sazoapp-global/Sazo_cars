'use server';
// Writing in the dealer's conversations (D-173): the API checks the writer works at the dealer and that a car
// may go in this conversation.
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function sendDealerMessage(form: FormData) {
  const org = text(form, 'org');
  const conversation = text(form, 'conversation');
  const back = `/dealer/${org}/messages?c=${encodeURIComponent(conversation)}`;
  const body = text(form, 'body');
  const stock = text(form, 'stock');
  if (!body) redirect(`${back}&error=${encodeURIComponent('Write a message')}`);
  let error: string | undefined;
  try {
    await api(`/dealer/messages/${encodeURIComponent(conversation)}`, { method: 'POST', auth: true, headers: { 'X-Organisation-Id': org }, body: { body, ...(stock ? { stockId: stock } : {}) } });
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    error = err.detail ?? 'The message was not sent. Try again.';
  }
  redirect(error ? `${back}&error=${encodeURIComponent(error)}` : back);
}
