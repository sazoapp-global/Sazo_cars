'use server';
// A customer's enquiry from a shared car page. No sign-in: the link's token decides which car and seller.
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { toE164 } from '@/lib/phone';

const TOKEN = /^[A-Za-z0-9_-]{20,40}$/;
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function enquire(form: FormData) {
  const token = text(form, 'token');
  if (!TOKEN.test(token)) redirect('/');
  const back = (q: Record<string, string>): never => redirect(`/c/${token}?${new URLSearchParams(q)}#ask`);
  const phone = toE164(text(form, 'phone'));
  if (text(form, 'name').length < 2) back({ error: 'Enter your name.' });
  if (!phone) back({ error: 'Enter a phone number we can reach you on, for example 0772 123 456.' });
  if (form.get('consent') !== 'on') back({ error: 'Tick the box to let the seller contact you.' });
  try {
    await api(`/cars/${token}/enquiries`, { method: 'POST', body: { name: text(form, 'name'), phone, consent: true, ...(text(form, 'message') ? { message: text(form, 'message') } : {}) } });
  } catch (err) {
    back({ error: err instanceof ApiError && err.detail ? err.detail : 'Your message could not be sent. Please try again.' });
  }
  back({ sent: '1' });
}
