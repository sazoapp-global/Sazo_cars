import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddCarForm } from '@/components/add-car-form';
import { api, isSignedIn } from '@/lib/api';
import type { SearchResult } from '@/lib/types';
import { Icon } from '@/components/icon';
import { SearchBox } from '@/components/search-box';
import { VehicleResult } from '@/components/vehicle-card';

export const metadata: Metadata = { title: 'Search results', robots: { index: false } };

export default async function Check({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  if (q.length < 4) redirect('/');
  const r = await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(q)}`);
  if (r.outcome === 'found' && r.matches.length === 1) redirect(`/v/${r.matches[0]!.vehicleRef}`);
  const signedIn = await isSignedIn();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="card p-4"><SearchBox defaultValue={q} size="md" /></div>

      {r.outcome === 'multiple' && (
        <section className="mt-6" aria-labelledby="multi">
          <h1 id="multi" className="font-display text-2xl font-bold">{r.matches.length} vehicles match <span className="sazo-id">{q.toUpperCase()}</span></h1>
          <p className="mt-1 text-muted">A plate should belong to one car. When it shows up on several, one of them may be using a copied plate. Check the chassis number on the car itself before going further.</p>
          <div className="mt-4 space-y-3">{r.matches.map((m) => <VehicleResult key={m.vehicleRef} v={m} />)}</div>
        </section>
      )}

      {r.outcome === 'not_found' && (
        <section className="mt-6" aria-labelledby="nf">
          <h1 id="nf" className="font-display text-2xl font-bold">We couldn&apos;t find this vehicle</h1>
          <p className="mt-1 text-muted">No records for <span className="sazo-id font-semibold">{r.normalizedQuery}</span> yet. That doesn&apos;t mean anything is wrong — SAZO doesn&apos;t have every car.</p>
          {r.suggestion && (
            <div className="card mt-4 p-4">
              <p className="font-semibold">Did you mean <Link className="link sazo-id" href={`/check?q=${encodeURIComponent(r.suggestion.query)}`}>{r.suggestion.query}</Link>?</p>
              <p className="text-sm text-muted">The letters O and I are easy to mix up with 0 and 1.</p>
            </div>
          )}
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" /><span>Check the plate on the car matches the logbook.</span></li>
            <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" /><span>A VIN has 17 characters and never contains the letters I, O or Q.</span></li>
            <li className="flex gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary-container" /><span>Try the chassis number printed on the logbook, e.g. <span className="sazo-id whitespace-nowrap">NZT260-3041234</span>.</span></li>
          </ul>
          {signedIn ? <AddCarForm plate={r.queryKind === 'plate' ? r.normalizedQuery : undefined} vin={r.queryKind === 'vin' ? r.normalizedQuery : undefined} /> : (
            <p className="mt-6 text-sm"><Link className="link" href={`/sign-in?next=${encodeURIComponent(`/check?q=${q}`)}`}>Sign in</Link> to add this car&apos;s details to SAZO.</p>
          )}
        </section>
      )}

      {r.outcome === 'invalid' && (
        <section className="mt-6">
          <h1 className="font-display text-2xl font-bold">That doesn&apos;t look like a plate or VIN</h1>
          <p className="mt-1 text-muted">Type a Ugandan number plate (e.g. <span className="sazo-id">UBK 482M</span>), a 17-character VIN, or a chassis number.</p>
        </section>
      )}
    </div>
  );
}
