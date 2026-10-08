import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import type { ConflictDetail, Summary } from '@/lib/types';
import { actOnConflict } from '../../actions';
import { requireStaff } from '../../guard';
import { CHECK, CONFLICT_STATUS, TOPIC, day, recordLabel, recordLine } from '../../labels';
import { Notice, type SP } from '../../notice';

export default async function ConflictPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const me = await requireStaff(`/admin/conflicts/${id}`);
  const sp = await searchParams;
  let c: ConflictDetail;
  try {
    c = await api<ConflictDetail>(`/admin/conflicts/${id}`, { auth: true });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const open = c.status === 'open' || c.status === 'under_review';
  const refs = [c.vehicleRef, ...c.relatedVehicleRefs];
  const cars = new Map(await Promise.all(refs.map(async (r) => [r, await api<Summary>(`/vehicles/${r}/summary`).catch(() => undefined)] as const)));
  const carName = (r: string) => {
    const v = cars.get(r)?.vehicle;
    return v ? `${[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}${v.currentPlate ? ` · plate ${v.currentPlate}` : ''}` : '';
  };
  const canResolve = me.isAdmin || me.platformRoles.includes('sazo_reviewer');
  return (
    <>
      <Link href="/admin/conflicts" className="link text-sm">← All conflicts</Link>
      <h1 className="mt-2 font-display text-2xl font-bold">{TOPIC[c.topic] ?? c.topic} conflict · <span className="sazo-id">{c.vehicleRef}</span></h1>
      <p className="text-muted">{c.openedByCheck ? CHECK[c.openedByCheck] ?? c.openedByCheck : ''} · {CONFLICT_STATUS[c.status]} · opened {day(c.openedAt)}
        {' · '}<Link className="link" href={`/v/${c.vehicleRef}/evidence`}>this vehicle&apos;s records</Link>
        {c.relatedVehicleRefs.map((r) => <span key={r}> · <Link className="link" href={`/v/${r}/evidence`}>{r}</Link></span>)}</p>
      <div className="mt-4"><Notice done={sp.done} error={sp.error} /></div>

      <section aria-labelledby="records" className="mt-2">
        <h2 id="records" className="font-display text-lg font-semibold">The records that disagree</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {c.observations.map((o) => (
            <article key={o.id} className="card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-label">{o.sourceCode ?? 'Unknown source'} · {o.evidenceClass.replace('_', ' ')}</p>
              <h3 className="font-semibold">{recordLabel(o.type)} · {day(o.eventTime, o.precision)}</h3>
              <p className="mt-1 text-sm">{recordLine(o.type, o.attributes)}</p>
              <p className="mt-1 text-xs text-muted">Received {day(o.recordedAt)}{o.evidenceKinds.length ? ` · photos: ${o.evidenceKinds.join(', ').replace(/_/g, ' ')}` : ' · no photos'}</p>
            </article>
          ))}
          {c.observations.length === 0 && <p className="text-muted">This conflict is about the vehicle&apos;s identifiers rather than individual records.</p>}
        </div>
        {c.disputedPlates.length > 0 && <p className="mt-3 rounded-lg border border-bad-line bg-bad-fill p-3 text-sm text-bad-text">Disputed plate on this vehicle: <span className="sazo-id font-bold">{c.disputedPlates.join(', ')}</span></p>}
      </section>

      {c.resolution && (
        <section className="card mt-4 p-4"><h2 className="font-semibold">Decision</h2>
          {c.resolution.interpretation && <p className="mt-1"><strong>What happened:</strong> {c.resolution.interpretation}</p>}
          <p className="mt-1"><strong>Why:</strong> {c.resolution.reasoning}</p></section>
      )}

      {open && canResolve && (
        <section className="card mt-4 p-4" aria-labelledby="resolve">
          <h2 id="resolve" className="font-display text-lg font-semibold">Resolve</h2>
          <form action={actOnConflict} className="mt-2 space-y-3">
            <input type="hidden" name="id" value={c.conflictId} />
            <div><label htmlFor="interpretation" className="label">What happened (shown in the audit trail)</label>
              <input id="interpretation" name="interpretation" className="field" placeholder="e.g. The 98,000 km garage reading was a typing mistake" /></div>
            <div><label htmlFor="reasoning" className="label">Why you think so</label>
              <textarea id="reasoning" name="reasoning" rows={3} className="field !min-h-24 py-3" placeholder="e.g. The odometer photo shows 198,000 km" /></div>
            {c.observations.length >= 2 && (
              <fieldset className="rounded-lg border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Optional: mark which record is wrong (it stays, but stops counting)</legend>
                <div className="grid gap-2 md:grid-cols-3">
                  <div><label htmlFor="relationTo" className="label">Wrong record</label>
                    <select id="relationTo" name="relationTo" className="field" defaultValue=""><option value="">—</option>{c.observations.map((o) => <option key={o.id} value={o.id}>{o.sourceCode} · {recordLabel(o.type)} · {day(o.eventTime)}</option>)}</select></div>
                  <div><label htmlFor="relationFrom" className="label">Is corrected by</label>
                    <select id="relationFrom" name="relationFrom" className="field" defaultValue=""><option value="">—</option>{c.observations.map((o) => <option key={o.id} value={o.id}>{o.sourceCode} · {recordLabel(o.type)} · {day(o.eventTime)}</option>)}</select></div>
                  <div><label htmlFor="relationKind" className="label">Because it is</label>
                    <select id="relationKind" name="relationKind" className="field" defaultValue="corrects"><option value="corrects">a mistake</option><option value="duplicates">a duplicate</option></select></div>
                </div>
              </fieldset>
            )}
            {c.disputedPlates.length > 0 && (
              <fieldset className="rounded-lg border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Which vehicle really has plate {c.disputedPlates[0]}?</legend>
                <input type="hidden" name="plate" value={c.disputedPlates[0]} />
                {refs.map((r) => (
                  <label key={r} className="flex items-start gap-2 py-1"><input type="radio" name="keepVehicleRef" value={r} className="mt-1 h-5 w-5" /><span><span className="font-semibold">{carName(r)}</span> <span className="sazo-id text-sm text-muted">{r}</span>{r === c.vehicleRef ? <span className="text-sm text-muted"> (this conflict)</span> : null}</span></label>
                ))}
                <label className="flex items-center gap-2 py-1"><input type="radio" name="keepVehicleRef" value="" defaultChecked className="h-5 w-5" />Don&apos;t change the plates</label>
              </fieldset>
            )}
            <div className="flex flex-wrap gap-2">
              <button name="action" value="resolve" className="btn btn-primary">Resolve</button>
              <button name="action" value="dismiss" className="btn btn-ghost">Dismiss (not a real conflict)</button>
              {c.status === 'open' && <button name="action" value="start_review" className="btn btn-ghost">I&apos;m looking at this</button>}
            </div>
          </form>
        </section>
      )}
      {!open && c.status !== 'auto_resolved' && canResolve && (
        <form action={actOnConflict} className="mt-4 flex gap-2">
          <input type="hidden" name="id" value={c.conflictId} />
          <input name="reasoning" className="field" placeholder="Why reopen?" aria-label="Why reopen" />
          <button name="action" value="reopen" className="btn btn-ghost">Reopen</button>
        </form>
      )}

      <section className="mt-6" aria-labelledby="activity">
        <h2 id="activity" className="font-display text-lg font-semibold">Activity</h2>
        <form action={actOnConflict} className="mt-2 flex gap-2">
          <input type="hidden" name="id" value={c.conflictId} />
          <input name="comment" className="field" placeholder="Add a note for other reviewers" aria-label="Note" required />
          <button name="action" value="comment" className="btn btn-ghost">Add note</button>
        </form>
        <ol className="mt-3 space-y-2 text-sm">
          {c.activity.slice().reverse().map((a, i) => (
            <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-muted">{day(a.at)}</span>
              <span><strong className="capitalize">{a.kind.replace('_', ' ')}</strong>{typeof a.details.comment === 'string' ? ` — ${a.details.comment}` : typeof a.details.reasoning === 'string' ? ` — ${a.details.reasoning}` : ''}</span></li>
          ))}
        </ol>
      </section>
    </>
  );
}
