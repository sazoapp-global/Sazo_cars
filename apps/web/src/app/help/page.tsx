import type { Metadata } from 'next';
import { api } from '@/lib/api';

export const metadata: Metadata = { title: 'Help' };

interface Faq { id: string; topic: string; question: string; answer: string }

/** Help (A-07): published questions and answers for everyone, plus those for the person's own groups. */
export default async function Help() {
  const { items } = await api<{ items: Faq[] }>('/help/faqs', { auth: true }).catch(() => api<{ items: Faq[] }>('/help/faqs'));
  const topics = [...new Set(items.map((f) => f.topic))];
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Help</h1>
        <p className="mt-1 text-muted">Answers to common questions. Signed in, you also see the ones for your work (garages, dealers and so on).</p>
      </div>
      {items.length === 0 ? <p className="text-muted">No questions yet.</p> : topics.map((t) => (
        <section key={t} aria-labelledby={`t-${t}`}>
          <h2 id={`t-${t}`} className="font-display text-lg font-bold">{t}</h2>
          <div className="mt-2 divide-y divide-line rounded-[14px] border border-line">
            {items.filter((f) => f.topic === t).map((f) => (
              <details key={f.id} className="p-4">
                <summary className="cursor-pointer font-semibold">{f.question}</summary>
                <p className="mt-2 whitespace-pre-line text-sm">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
