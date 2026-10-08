import { HEALTH_FACTORS, QUESTION_ORDER, QUESTION_TITLES, CONFIDENCE_LABELS, factValue, formatUgx, headline, statusLabel } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StatusChip } from '@/components/status';
import { Plate } from '@/components/plate';
import { vehicleName } from '@/components/vehicle-card';
import { ApiError, api, isSignedIn } from '@/lib/api';
import type { Comparison, SavedCheck } from '@/lib/types';

export const metadata: Metadata = { title: 'Compare cars', robots: { index: false } };

export default async function Compare({ searchParams }: { searchParams: Promise<{ r?: string | string[] }> }) {
  const sp = await searchParams;
  const refs = [...new Set([sp.r ?? []].flat())].slice(0, 3);
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(`/compare?${refs.map((r) => `r=${r}`).join('&')}`)}`);

  if (refs.length < 2) {
    const saved = (await api<{ items: SavedCheck[] }>('/me/saved-checks', { auth: true })).items.filter((s) => !refs.includes(s.vehicleRef));
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <h1 className="font-display text-2xl font-bold">Compare cars</h1>
        <p className="mt-1 text-muted">Pick {refs.length ? 'one or two more cars' : '2 or 3 cars'} from your saved cars.</p>
        <form action="/compare" method="get" className="mt-4 space-y-2">
          {refs.map((r) => <input key={r} type="hidden" name="r" value={r} />)}
          {saved.length === 0 ? <p className="card p-4">Save another car first — open its report and tap <strong>Save this car</strong>.</p> : saved.map((s) => (
            <label key={s.vehicleRef} className="card flex items-center gap-3 p-3"><input type="checkbox" name="r" value={s.vehicleRef} className="h-6 w-6 accent-[#0033aa]" />
              <span className="font-semibold">{vehicleName(s.summary.vehicle)}</span>{s.summary.vehicle.currentPlate && <Plate value={s.summary.vehicle.currentPlate} size="sm" />}</label>
          ))}
          {saved.length > 0 && <button className="btn btn-primary">Compare</button>}
        </form>
      </div>
    );
  }

  let c: Comparison;
  try {
    c = await api<Comparison>(`/vehicles/compare?refs=${refs.join(',')}`, { auth: true });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 404)) redirect('/compare');
    throw err;
  }
  const differs = new Set(c.differingQuestions);
  const col = 'min-w-[220px] p-3 align-top';
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-8">
      <h1 className="font-display text-2xl font-bold">Compare cars</h1>
      <p className="mt-1 text-muted">Rows where the cars differ are highlighted. Reviews and opinions are not included — only what the records show.</p>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 w-40 bg-white p-3 text-[11px] uppercase tracking-wider text-label">Car</th>
              {c.vehicles.map((v) => (
                <th key={v.vehicle.vehicleRef} scope="col" className={col}>
                  {v.vehicle.currentPlate && <Plate value={v.vehicle.currentPlate} size="sm" />}
                  <Link href={`/v/${v.vehicle.vehicleRef}`} className="mt-1 block font-display text-base font-bold hover:underline">{vehicleName(v.vehicle)}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr><th scope="row" className="sticky left-0 bg-white p-3 font-semibold">Vehicle Health</th>
              {c.vehicles.map((v) => <td key={v.vehicle.vehicleRef} className={col}>{v.health.insufficient ? <span className="text-na-text">Insufficient history</span> : <><span className="font-display text-xl font-extrabold">{v.health.score}</span><span className="text-muted"> / 100</span>
                {v.health.deductions.length > 0 && <span className="block text-xs text-muted">{v.health.deductions.map((d) => HEALTH_FACTORS[d.key]).join(', ')}</span>}</>}</td>)}</tr>
            <tr><th scope="row" className="sticky left-0 bg-white p-3 font-semibold">Record Confidence</th>
              {c.vehicles.map((v) => <td key={v.vehicle.vehicleRef} className={col}><span className="font-semibold">{CONFIDENCE_LABELS[v.recordConfidence.level]}</span><span className="block text-xs text-muted">{v.recordConfidence.records} records · {v.recordConfidence.sources} sources</span></td>)}</tr>
            <tr><th scope="row" className="sticky left-0 bg-white p-3 font-semibold">Mileage <span className="block text-xs font-normal text-muted">best estimate</span></th>
              {c.vehicles.map((v) => { const f = v.facts.find((x) => x.key === 'current_mileage_km'); return <td key={v.vehicle.vehicleRef} className={col}>{f ? factValue(f.key, f.value) : '—'}</td>; })}</tr>
            {QUESTION_ORDER.map((q) => (
              <tr key={q} className={differs.has(q) ? 'bg-warn-fill/60' : undefined}>
                <th scope="row" className={`sticky left-0 p-3 font-semibold ${differs.has(q) ? 'bg-warn-fill' : 'bg-white'}`}>{QUESTION_TITLES[q]?.short}{differs.has(q) && <span className="block text-xs font-normal text-warn-text">differs</span>}</th>
                {c.vehicles.map((v) => {
                  const a = v.questions.find((x) => x.question === q)!;
                  return (
                    <td key={v.vehicle.vehicleRef} className={col}>
                      <StatusChip status={a.status} label={statusLabel(q, a.status)} />
                      <p className="mt-1">{headline(a.headlineKey, a.params)}</p>
                      {q === 'valuation' && v.valuation.range && <p className="mt-1 font-semibold">{formatUgx(v.valuation.range.lowUgx)} – {formatUgx(v.valuation.range.highUgx)}</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
