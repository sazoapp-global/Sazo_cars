import { CONFIDENCE_LABELS, HEALTH_FACTORS, QUESTION_ORDER, QUESTION_TITLES, factValue, formatUgx, headline, statusLabel } from '@sazo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/icon';
import { Plate } from '@/components/plate';
import { StatusChip } from '@/components/status';
import { vehicleName } from '@/components/vehicle-card';
import { ApiError, api, isSignedIn } from '@/lib/api';
import { QUESTION_ICONS } from '@/lib/questions';
import type { CarPhoto } from '@/lib/report-data';
import type { Comparison, FullReport, ModelCommunity, SavedCheck } from '@/lib/types';

export const metadata: Metadata = { title: 'Compare cars', robots: { index: false } };

const PLATFORM: Record<string, string> = { tiktok: 'TikTok', youtube: 'YouTube', instagram: 'Instagram' };
const qs = (refs: string[]) => refs.map((r) => `r=${r}`).join('&');

export default async function Compare({ searchParams }: { searchParams: Promise<{ r?: string | string[] }> }) {
  const sp = await searchParams;
  const refs = [...new Set([sp.r ?? []].flat())].slice(0, 3);
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(`/compare?${qs(refs)}`)}`);
  const saved = refs.length < 3
    ? (await api<{ items: SavedCheck[] }>('/me/saved-checks', { auth: true }).catch(() => ({ items: [] as SavedCheck[] }))).items.filter((s) => !refs.includes(s.vehicleRef))
    : [];

  if (refs.length < 2) return <Pick refs={refs} saved={saved} />;

  let c: Comparison;
  try {
    c = await api<Comparison>(`/vehicles/compare?refs=${refs.join(',')}`, { auth: true });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 404)) redirect('/compare');
    throw err;
  }
  const photos = await Promise.all(c.vehicles.map((v) =>
    api<{ items: CarPhoto[] }>(`/vehicles/${v.vehicle.vehicleRef}/photos`, { auth: true }).then((x) => x.items[0]).catch(() => undefined)));
  const models = [...new Map(c.vehicles.filter((v) => v.model).map((v) => [v.model!.modelId, v.model!])).values()];
  const communities = (await Promise.all(models.map((m) => api<ModelCommunity>(`/models/${m.modelId}/community`, { auth: true }).catch(() => undefined))))
    .filter((x): x is ModelCommunity => !!x);
  const differs = new Set(c.differingQuestions);

  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-soft to-surface">
        <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-8 md:py-10 lg:px-12">
          <span className="chip border-transparent bg-lime text-ink">Side by side</span>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-primary-container md:text-4xl">Compare cars</h1>
          <p className="mt-2 max-w-2xl text-muted">The same seven questions for each car, from their records. Rows where the cars differ are marked. Owner reviews are about the model in general and are kept separate.</p>
          <div className={`mt-6 grid gap-4 ${c.vehicles.length + (refs.length < 3 ? 1 : 0) >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {c.vehicles.map((v, i) => <CarCard key={v.vehicle.vehicleRef} v={v} photo={photos[i]} remove={refs.length > 2 ? `/compare?${qs(refs.filter((r) => r !== v.vehicle.vehicleRef))}` : undefined} />)}
            {refs.length < 3 && <AddSlot refs={refs} saved={saved} />}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] space-y-10 px-4 py-8 md:px-8 md:py-12 lg:px-12">
        <section aria-labelledby="matrix">
          <h2 id="matrix" className="font-display text-2xl font-extrabold text-primary-container md:text-3xl">The 7 buyer questions</h2>
          <p className="mt-1 text-muted">What the records say for each car, question by question.</p>
          <div tabIndex={0} role="region" aria-label="The 7 buyer questions, side by side (scrolls sideways on small screens)" className="mt-5 overflow-x-auto rounded-[14px] border border-line bg-white focus-visible:outline-2 focus-visible:outline-primary-container">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Seven buyer questions compared across {c.vehicles.length} cars</caption>
              <thead className="bg-soft">
                <tr>
                  <th scope="col" className="w-60 p-4 text-[11px] font-bold uppercase tracking-wider text-label">Question</th>
                  {c.vehicles.map((v) => (
                    <th key={v.vehicle.vehicleRef} scope="col" className="p-4 align-bottom">
                      <span className="block font-display text-base font-bold text-ink">{vehicleName(v.vehicle)}</span>
                      {v.vehicle.currentPlate && <span className="mt-1 inline-block"><Plate value={v.vehicle.currentPlate} size="sm" /></span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <Row label="Vehicle Health" sub="Condition the records suggest">
                  {c.vehicles.map((v) => (
                    <td key={v.vehicle.vehicleRef} className="p-4 align-top">
                      {v.health.insufficient ? <span className="font-semibold text-na-text">Insufficient history</span> : (
                        <><span className="font-display text-2xl font-extrabold">{v.health.score}</span><span className="text-muted"> / 100</span>
                          {v.health.deductions.length > 0 && <span className="block text-xs text-muted">{v.health.deductions.map((d) => HEALTH_FACTORS[d.key]).join(', ')}</span>}</>
                      )}
                    </td>
                  ))}
                </Row>
                <Row label="Record Confidence" sub="How complete the history is">
                  {c.vehicles.map((v) => (
                    <td key={v.vehicle.vehicleRef} className="p-4 align-top"><span className="font-semibold">{CONFIDENCE_LABELS[v.recordConfidence.level]}</span>
                      <span className="block text-xs text-muted">{v.recordConfidence.records} records · {v.recordConfidence.sources} sources</span></td>
                  ))}
                </Row>
                {QUESTION_ORDER.map((q, i) => {
                  const diff = differs.has(q);
                  return (
                    <tr key={q} className={diff ? 'bg-warn-fill/40' : undefined}>
                      <th scope="row" className="p-4 align-top">
                        <span className="flex items-start gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-soft text-primary-container"><Icon name={QUESTION_ICONS[q] ?? 'help'} size={18} /></span>
                          <span>
                            <span className="block font-display font-bold">{i + 1}. {QUESTION_TITLES[q]?.short}</span>
                            <span className="block text-xs font-normal text-muted">{QUESTION_TITLES[q]?.ask}</span>
                            {diff ? <span className="chip mt-1 border-warn-line bg-warn-fill text-warn-text">differs</span> : <span className="chip mt-1 border-ok-line bg-ok-fill text-ok-text">same answer</span>}
                          </span>
                        </span>
                      </th>
                      {c.vehicles.map((v) => <Cell key={v.vehicle.vehicleRef} v={v} q={q} />)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {communities.length > 0 && (
          <section aria-labelledby="owners">
            <span className="chip border-transparent bg-bad-fill text-bad-text">Opinions, not records</span>
            <h2 id="owners" className="mt-2 font-display text-2xl font-extrabold text-primary-container md:text-3xl">Owner reviews and videos</h2>
            <p className="mt-1 text-muted">What owners and creators say about each model in general. Checked by SAZO before they appear.</p>
            <div className={`mt-5 grid gap-4 ${communities.length > 1 ? 'md:grid-cols-2' : ''} ${communities.length > 2 ? 'lg:grid-cols-3' : ''}`}>
              {communities.map((m) => <CommunityCard key={m.model.modelId} m={m} />)}
            </div>
          </section>
        )}

        <section aria-labelledby="decide" className="rounded-[14px] bg-ink p-6 text-white md:p-8">
          <span className="chip border-transparent bg-lime text-ink">Next steps</span>
          <h2 id="decide" className="mt-3 font-display text-2xl font-extrabold md:text-3xl">Read each car’s full report</h2>
          <p className="mt-1 max-w-2xl text-white/80">Each report shows the records behind every answer. Then see the car in person, with a mechanic you trust.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {c.vehicles.map((v) => (
              <Link key={v.vehicle.vehicleRef} href={`/v/${v.vehicle.vehicleRef}`} className="btn btn-focal">{vehicleName(v.vehicle)}<Icon name="arrow_forward" size={18} /></Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" className="p-4 align-top"><span className="block font-display font-bold">{label}</span><span className="block text-xs font-normal text-muted">{sub}</span></th>
      {children}
    </tr>
  );
}

function Cell({ v, q }: { v: FullReport; q: string }) {
  const a = v.questions.find((x) => x.question === q);
  if (!a) return <td className="p-4 align-top text-muted">—</td>;
  const km = v.facts.find((f) => f.key === 'current_mileage_km');
  return (
    <td className="p-4 align-top">
      <StatusChip status={a.status} label={statusLabel(q, a.status)} />
      {q === 'mileage' && km && <p className="mt-2 font-display text-lg font-extrabold">{factValue(km.key, km.value)}</p>}
      {q === 'valuation' && v.valuation.range && <p className="mt-2 font-display text-lg font-extrabold">{formatUgx(v.valuation.range.lowUgx)} – {formatUgx(v.valuation.range.highUgx)}</p>}
      <p className="mt-1">{headline(a.headlineKey, a.params)}</p>
    </td>
  );
}

function CarCard({ v, photo, remove }: { v: FullReport; photo?: CarPhoto; remove?: string }) {
  const ref = v.vehicle.vehicleRef;
  const score = v.health.insufficient ? null : v.health.score;
  return (
    <article className="card flex flex-col overflow-hidden" aria-label={vehicleName(v.vehicle)}>
      <div className={`relative bg-soft ${photo ? 'aspect-[16/9]' : 'aspect-[16/7]'}`}>
        {photo ? (
          <img src={`/v/${ref}/photo/${photo.photoId}`} alt={`Inspection photo of the ${vehicleName(v.vehicle)}`} className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-primary-container/50"><Icon name="directions_car" size={56} /></span>
        )}
        {v.vehicle.currentPlate && <span className="absolute bottom-3 left-3"><Plate value={v.vehicle.currentPlate} size="sm" /></span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="font-display text-lg font-bold">{vehicleName(v.vehicle)}</h2>
        <div className="mt-3 rounded-lg bg-soft p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-label">Estimated price</p>
          <p className="font-display text-xl font-extrabold text-primary-container">{v.valuation.range ? `${formatUgx(v.valuation.range.lowUgx)} – ${formatUgx(v.valuation.range.highUgx)}` : 'Not enough data'}</p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className={`grid size-12 shrink-0 place-items-center rounded-full border-4 font-display font-extrabold ${score === null ? 'border-na-line text-na-text' : score >= 80 ? 'border-lime text-ink' : score >= 50 ? 'border-warn-line text-warn-text' : 'border-bad-line text-bad-text'}`}>{score ?? '—'}</span>
          <p className="text-sm"><span className="font-semibold">Vehicle Health</span><span className="block text-muted">Record Confidence: {CONFIDENCE_LABELS[v.recordConfidence.level]}</span></p>
        </div>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <Link href={`/v/${ref}`} className="btn btn-primary flex-1">Open report</Link>
          {remove && <Link href={remove} className="btn btn-ghost" aria-label={`Remove ${vehicleName(v.vehicle)} from the comparison`}><Icon name="close" /></Link>}
        </div>
      </div>
    </article>
  );
}

function AddSlot({ refs, saved }: { refs: string[]; saved: SavedCheck[] }) {
  return (
    <div className="flex flex-col rounded-[14px] border-2 border-dashed border-soft-3 bg-white/60 p-5">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-soft text-primary-container"><Icon name="add" size={28} /></span>
      <h2 className="mt-2 text-center font-display text-lg font-bold">Add a car</h2>
      {saved.length ? (
        <>
          <p className="text-center text-sm text-muted">From your saved cars:</p>
          <ul className="mt-3 space-y-2">
            {saved.slice(0, 5).map((s) => (
              <li key={s.vehicleRef}>
                <Link href={`/compare?${qs([...refs, s.vehicleRef])}`} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white p-3 text-sm font-semibold hover:border-primary-container">
                  <span>{vehicleName(s.summary.vehicle)}</span>{s.summary.vehicle.currentPlate && <Plate value={s.summary.vehicle.currentPlate} size="sm" />}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="text-center text-sm text-muted">Check a car and tap <strong>Save this car</strong>, then add it here.</p>}
      <Link href="/#check" className="link mt-4 self-center text-sm">Check another car</Link>
    </div>
  );
}

function CommunityCard({ m }: { m: ModelCommunity }) {
  return (
    <article className="card flex flex-col p-5" aria-labelledby={`m-${m.model.modelId}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 id={`m-${m.model.modelId}`} className="font-display text-lg font-bold">{m.model.label}</h3>
        {m.averageRating !== null && <span className="chip border-transparent bg-lime text-ink"><Icon name="star" size={14} />{m.averageRating} / 5</span>}
      </div>
      <p className="text-sm text-muted">{m.reviewCount} {m.reviewCount === 1 ? 'review' : 'reviews'}</p>
      {m.reviews[0] && <blockquote className="mt-3 border-l-2 border-soft-3 pl-3 text-sm">“{m.reviews[0].body.length > 220 ? `${m.reviews[0].body.slice(0, 220)}…` : m.reviews[0].body}”<footer className="mt-1 text-xs text-muted">— {m.reviews[0].author}{m.reviews[0].verifiedOwner ? ', verified owner' : ''}</footer></blockquote>}
      {m.creatorLinks.length > 0 && (
        <ul className="mt-4 space-y-2">
          {m.creatorLinks.slice(0, 3).map((l) => (
            <li key={l.linkId}>
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-center gap-3 rounded-lg bg-ink p-3 text-white hover:bg-primary">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime text-ink"><Icon name="play_arrow" size={20} /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{l.title ?? `${PLATFORM[l.platform] ?? 'Video'} video`}</span><span className="text-xs text-white/70">Watch on {PLATFORM[l.platform] ?? 'the web'}</span></span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {m.reviews.length === 0 && m.creatorLinks.length === 0 && <p className="mt-3 text-sm text-muted">No reviews or videos yet. Add one from the car’s report.</p>}
    </article>
  );
}

function Pick({ refs, saved }: { refs: string[]; saved: SavedCheck[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <span className="chip border-transparent bg-lime text-ink">Side by side</span>
      <h1 className="mt-3 font-display text-3xl font-extrabold text-primary-container">Compare cars</h1>
      <p className="mt-1 text-muted">Pick {refs.length ? 'one or two more cars' : '2 or 3 cars'} from your saved cars.</p>
      <form action="/compare" method="get" className="mt-5 space-y-2">
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
