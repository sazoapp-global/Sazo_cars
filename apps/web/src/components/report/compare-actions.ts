'use server';
// Adding a car to the Compare view of a report inside a workspace (28 Oct 2026): from the dealer's own cars or by
// plate, VIN or chassis number. Comes back to the same page; nothing leaves the workspace.
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export async function addToCompare(form: FormData) {
  const base = String(form.get('base') ?? '');
  if (!/^\/(dealer|admin|partner)\/[^\s\\]*$/.test(base) || base.startsWith('//')) redirect('/');
  const self = String(form.get('self') ?? '');
  const list = String(form.get('cmp') ?? '').split(',').filter((r) => REF.test(r) && r !== self);
  const go = (q: Record<string, string | undefined>) => {
    const u = new URL(base, 'http://x');
    u.searchParams.set('view', 'compare');
    for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
    redirect(`${u.pathname}${u.search}`);
  };
  let ref = String(form.get('pick') ?? '');
  const q = String(form.get('q') ?? '').trim();
  if (!REF.test(ref) && q) {
    const found = await api<{ outcome: string; matches: { vehicleRef: string }[] }>(`/vehicles/search?q=${encodeURIComponent(q)}`, { auth: true }).catch(() => undefined);
    if (!found || found.matches.length === 0) go({ cmp: list.join(',') || undefined, cmpError: `SAZO has no car with ${q.toUpperCase()}.` });
    if (found!.matches.length > 1) go({ cmp: list.join(',') || undefined, cmpError: `More than one car matches ${q.toUpperCase()}. Type the full chassis number or VIN.` });
    ref = found!.matches[0]!.vehicleRef;
  }
  if (!REF.test(ref)) go({ cmp: list.join(',') || undefined, cmpError: 'Choose one of your cars or type a plate.' });
  if (ref === self || list.includes(ref)) go({ cmp: list.join(',') || undefined, cmpError: 'That car is already in the comparison.' });
  go({ cmp: [...list, ref].slice(0, 2).join(','), cmpError: undefined });
}
