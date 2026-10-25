import { saveFaq } from '../actions';
import { AUDIENCES, audienceLabel } from '../audiences';
import { adminFetch, requireStaff } from '../guard';
import { Forbidden, Notice, type SP } from '../notice';

interface Faq { id: string; audience: string; topic: string; question: string; answer: string; status: 'draft' | 'published' | 'hidden'; position: number }
const STATUS: [Faq['status'], string][] = [['draft', 'Draft'], ['published', 'Published'], ['hidden', 'Hidden']];

function Fields({ f }: { f?: Faq }) {
  const k = f?.id ?? 'new';
  return (
    <>
      <div><label htmlFor={`q-${k}`} className="label">Question</label><input id={`q-${k}`} name="question" required minLength={5} maxLength={200} defaultValue={f?.question} className="field" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label htmlFor={`t-${k}`} className="label">Topic</label><input id={`t-${k}`} name="topic" required minLength={2} maxLength={60} defaultValue={f?.topic} className="field" placeholder="Getting started" /></div>
        <div><label htmlFor={`a-${k}`} className="label">Who is it for?</label>
          <select id={`a-${k}`} name="audience" defaultValue={f?.audience ?? 'everyone'} className="field">{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      <div className="sm:col-span-2"><label htmlFor={`ans-${k}`} className="label">Answer</label><textarea id={`ans-${k}`} name="answer" required minLength={5} maxLength={3000} rows={3} defaultValue={f?.answer} className="field" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label htmlFor={`s-${k}`} className="label">Status</label>
          <select id={`s-${k}`} name="status" defaultValue={f?.status ?? 'draft'} className="field">{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label htmlFor={`p-${k}`} className="label">Order</label><input id={`p-${k}`} name="position" inputMode="numeric" defaultValue={f?.position ?? 100} className="field tabular-nums" /></div>
      </div>
    </>
  );
}

/** A-07: help questions and answers for each group. Drafts are seen only here; every change is kept. */
export default async function Faqs({ searchParams }: { searchParams: SP }) {
  await requireStaff('/admin/faqs');
  const sp = await searchParams;
  const data = await adminFetch<{ items: Faq[] }>('/admin/faqs');
  return (
    <>
      <h1 className="font-display text-2xl font-bold">Help answers</h1>
      <p className="mb-4 max-w-2xl text-muted">Questions and answers people see on the Help page, for everyone or for one group. Only published ones are shown. Every change is kept with who made it and what it was before.</p>
      <Notice done={sp.done} error={sp.error} />
      {data === 'forbidden' ? <Forbidden what="writing help answers" /> : (
        <>
          <details className="card mb-6 p-4">
            <summary className="cursor-pointer font-semibold text-primary">Add a question</summary>
            <form action={saveFaq} data-draft="faq-new" className="mt-3 grid gap-3 sm:grid-cols-2"><Fields /><div className="sm:col-span-2"><button className="btn btn-primary">Add</button></div></form>
          </details>
          {data.items.length === 0 ? <p className="text-muted">No questions yet.</p> : (
            <ul className="space-y-3" aria-label="Help answers">
              {data.items.map((f) => (
                <li key={f.id} className="card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold">{f.question}</h2>
                    <span className="text-sm text-muted">{f.topic} · {audienceLabel(f.audience)} · {STATUS.find(([v]) => v === f.status)?.[1]}</span>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-primary">Change</summary>
                    <form action={saveFaq} data-draft={`faq-${f.id}`} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="id" value={f.id} /><Fields f={f} />
                      <div className="sm:col-span-2"><button className="btn btn-primary">Save</button></div></form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
