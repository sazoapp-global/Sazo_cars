'use client';
// Keeps what people type (25 Oct 2026): a form marked data-draft="<name>" is saved in this browser tab as the
// person types, and filled back in after a refresh, a failed send, or switching between phone and email.
// - Kept in this tab only (sessionStorage): closing the tab forgets it, and it expires after two hours.
// - Never kept: passwords, codes, National ID numbers, files, hidden fields, or a field marked data-no-draft.
// - Forgotten once the form has been sent and the page moves on, and on sign out (data-clear-drafts).
import { useEffect } from 'react';

const PREFIX = 'sazo-draft:';
const MAX_AGE = 2 * 60 * 60 * 1000;
const SECRET = /pass|confirm|code|otp|nin|token|secret/i;
const SKIP_TYPES = new Set(['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image']);

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Saved = { at: number; v: Record<string, string | string[]> };

const store = {
  get(key: string): Saved | undefined {
    try {
      const s = JSON.parse(sessionStorage.getItem(PREFIX + key) ?? 'null') as Saved | null;
      if (!s || Date.now() - s.at > MAX_AGE) return undefined;
      return s;
    } catch { return undefined; }
  },
  set(key: string, v: Saved['v']) { try { sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), v })); } catch { /* storage off */ } },
  drop(key: string) { try { sessionStorage.removeItem(PREFIX + key); } catch { /* storage off */ } },
  dropAll() {
    try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k); } catch { /* storage off */ }
  },
};

const keepable = (el: Element): el is Field =>
  (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
  && !!el.name && !SECRET.test(el.name) && !el.hasAttribute('data-no-draft')
  && !(el instanceof HTMLInputElement && SKIP_TYPES.has(el.type))
  && !(el instanceof HTMLInputElement && el.autocomplete === 'one-time-code');

const fields = (form: HTMLFormElement) => [...form.elements].filter(keepable);

function read(form: HTMLFormElement): Saved['v'] {
  const v: Saved['v'] = {};
  for (const el of fields(form)) {
    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      const list = (v[el.name] as string[] | undefined) ?? [];
      if (el.checked) list.push(el.value);
      v[el.name] = list;
    } else v[el.name] = el.value;
  }
  return v;
}

/** Sets a value the way typing would, so fields that React controls take it too. */
function put(el: Field, value: string) {
  if (el.value === value) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

let restoring = false;

function restore(form: HTMLFormElement, saved: Saved['v']) {
  restoring = true;
  try {
    for (const el of fields(form)) {
      const s = saved[el.name];
      if (s === undefined) continue;
      if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
        const on = Array.isArray(s) && s.includes(el.value);
        if (on && !el.checked) el.click();
        else if (!on && el.checked && el.type === 'checkbox') el.click();
      } else if (typeof s === 'string' && s !== '') put(el, s);
    }
  } finally {
    restoring = false;
  }
}

export function DraftKeeper() {
  useEffect(() => {
    const seen = new WeakSet<HTMLFormElement>();
    const sent = new WeakSet<HTMLFormElement>();
    const live = new Map<HTMLFormElement, string>();
    const pending = new Set<string>();
    const keyOf = (f: HTMLFormElement) => f.dataset.draft;

    const adopt = (form: HTMLFormElement) => {
      const key = keyOf(form);
      if (!key || seen.has(form)) return;
      seen.add(form);
      live.set(form, key);
      if (pending.delete(key)) {
        // Sent and back again: fill it in only when the page came back with a problem.
        setTimeout(() => { const saved = store.get(key); if (problem() && saved) restore(form, saved.v); else store.drop(key); }, 300);
        return;
      }
      const saved = store.get(key);
      if (saved) restore(form, saved.v);
    };
    const scan = () => document.querySelectorAll<HTMLFormElement>('form[data-draft]').forEach(adopt);

    const onType = (e: Event) => {
      const form = (e.target as Element | null)?.closest?.('form');
      const key = form && keyOf(form);
      if (!form || !key || restoring) return;
      sent.delete(form);
      // Forms sharing a name (phone and email sign-up) share one draft: keep what the other one had.
      store.set(key, { ...(store.get(key)?.v ?? {}), ...read(form) });
    };
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (form.hasAttribute('data-clear-drafts')) { store.dropAll(); return; }
      if (keyOf(form)) { store.set(keyOf(form)!, { ...(store.get(keyOf(form)!)?.v ?? {}), ...read(form) }); sent.add(form); }
    };

    // After a send, React puts the form back to what the page now shows (the kept values after a problem,
    // empty after a success that stays on the page): keep exactly that.
    const onReset = (e: Event) => {
      const form = e.target as HTMLFormElement;
      const key = keyOf(form);
      if (!key) return;
      setTimeout(() => store.set(key, { ...(store.get(key)?.v ?? {}), ...read(form) }), 0);
    };

    // Forms come and go as people move around; a sent form that has gone means the page moved on: forget it.
    // A form sent back with a problem (the page shows ?error=…) keeps what was typed, so it is filled in again.
    // The decision waits a moment, since the address may change just after the form goes.
    const problem = () => new URLSearchParams(location.search).has('error');
    const watch = new MutationObserver(() => {
      for (const [form, key] of live) {
        if (form.isConnected) continue;
        live.delete(form);
        if (sent.has(form)) {
          pending.add(key);
          setTimeout(() => { if (pending.delete(key) && !problem()) store.drop(key); }, 300);
        }
      }
      scan();
    });

    scan();
    watch.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('input', onType, true);
    document.addEventListener('change', onType, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('reset', onReset, true);
    return () => {
      watch.disconnect();
      document.removeEventListener('input', onType, true);
      document.removeEventListener('change', onType, true);
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('reset', onReset, true);
    };
  }, []);
  return null;
}

/** Forget a form's draft when this renders: for a page that is only reached once that form has done its job. */
export function ForgetDraft({ name }: { name: string }) {
  useEffect(() => { store.drop(name); }, [name]);
  return null;
}
