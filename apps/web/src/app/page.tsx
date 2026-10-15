import { QUESTION_ORDER, QUESTION_TITLES, statusLabel, summaryLine } from '@sazo/contracts';
import Image from 'next/image';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';
import { QUESTION_BLURBS, QUESTION_ICONS } from '@/lib/questions';
import { Plate } from '@/components/plate';
import { SearchBox } from '@/components/search-box';
import { StatusChip } from '@/components/status';
import { vehicleName } from '@/components/vehicle-card';
import { api } from '@/lib/api';
import type { SearchResult, Summary } from '@/lib/types';

/** A sample car whose public summary the home page previews (real records, simulated data). */
const SAMPLE_PLATE = 'UBJ 214K';

async function sample(): Promise<Summary | undefined> {
  try {
    const s = await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(SAMPLE_PLATE)}`);
    const ref = s.outcome === 'found' ? s.matches[0]?.vehicleRef : undefined;
    return ref ? await api<Summary>(`/vehicles/${ref}/summary`) : undefined;
  } catch {
    return undefined;
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const preview = await sample();
  return (
    <>
      {deleted && <p role="status" className="bg-ok-fill px-4 py-3 text-center font-semibold text-ok-text">Your account has been deleted. Thank you for using SAZO.</p>}

      {/* Hero */}
      <section id="check" className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-lime/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-12 md:px-8 md:py-20 lg:grid-cols-[1.1fr_1fr] lg:px-12">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-lime bg-lime/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-lime ring-2 ring-primary/20" />Buying or selling a car?
            </span>
            <h1 className="mt-5 font-display text-[40px] font-extrabold leading-[1.05] tracking-tight text-primary md:text-6xl">
              Know the car<br /><span className="relative inline-block">before you buy it.<span aria-hidden className="absolute inset-x-0 bottom-1 -z-10 h-3 rounded bg-lime md:h-4" /></span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Check a car’s history, mileage, service records, accident records and other available information before you make a decision.</p>
            <div className="mt-6 max-w-xl"><SearchBox autoFocus /></div>
            <p className="mt-2 text-sm text-label">It only takes a few seconds. Free while SAZO is in testing.</p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink">
              <li className="flex items-center gap-2"><Icon name="pin_drop" size={18} className="text-primary-container" />Built for Uganda</li>
              <li className="flex items-center gap-2"><Icon name="verified_user" size={18} className="text-primary-container" />Records from approved contributors</li>
            </ul>
          </div>
          <div className="relative">
            <div className="card overflow-hidden !rounded-3xl p-3 shadow-[0_20px_25px_-5px_rgba(11,19,43,0.08),0_8px_10px_-6px_rgba(11,19,43,0.04)]">
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-soft">
                <Image src="/images/studio-suv.webp" alt="A crossover car in a studio (illustration)" fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" priority />
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-label">Illustration</span>
              </div>
              {preview && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-primary-container px-4 py-3 text-white">
                  <div className="flex items-center gap-3">
                    {preview.vehicle.currentPlate && <Plate value={preview.vehicle.currentPlate} size="sm" />}
                    <div>
                    <p className="font-display text-sm font-bold uppercase tracking-wide">{vehicleName(preview.vehicle)}</p>
                    <p className="text-xs text-white/80">{preview.recordConfidence.records} records from {preview.recordConfidence.sources} sources</p>
                    </div>
                  </div>
                  <Link href={`/v/${preview.vehicle.vehicleRef}`} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25">See its check →</Link>
                </div>
              )}
              <div className="mt-3 rounded-xl border border-line p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-label">One check. A clearer story.</p>
                <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-primary-container">
                  {['Official records', 'Approved garages', 'Inspectors'].map((t) => <li key={t} className="rounded-lg bg-soft px-2 py-2">{t}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Kinds of records */}
      <section className="border-y border-line bg-white" aria-label="Kinds of records SAZO brings together">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 md:px-8 lg:px-12">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-label"><span className="h-1.5 w-1.5 rounded-full bg-lime" />Records SAZO brings together</p>
          {([['Registration', 'badge'], ['Customs & import', 'directions_boat'], ['Police', 'local_police'], ['Lenders', 'account_balance'], ['Insurers', 'security'], ['Garages', 'handyman'], ['Inspectors', 'fact_check'], ['Auctions', 'gavel']] as [string, IconName][]).map(([t, i]) => (
            <span key={t} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink"><Icon name={i} size={16} className="text-primary-container" />{t}</span>
          ))}
        </div>
      </section>

      {/* A quick preview — a real car's public summary */}
      {preview && (
        <section className="mx-auto max-w-[1280px] px-4 py-16 md:px-8 lg:px-12" aria-labelledby="preview">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-container">A quick preview</p>
          <h2 id="preview" className="mt-2 font-display text-3xl font-extrabold leading-tight text-primary md:text-4xl">Less guesswork.<br />More confidence.</h2>
          <p className="mt-2 text-muted">This is a real check from SAZO’s test records: the same summary anyone sees without an account.</p>
          <div className="card mt-8 grid overflow-hidden lg:grid-cols-[1.4fr_1fr]">
            <div className="p-5 md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-label">Here’s what we found</p>
                  <p className="mt-1 font-display text-2xl font-extrabold uppercase text-primary">{[preview.vehicle.make, preview.vehicle.model].filter(Boolean).join(' ')}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted">{preview.vehicle.year}{preview.vehicle.currentPlate && <Plate value={preview.vehicle.currentPlate} size="sm" tone="light" />}</p>
                </div>
                <span className="chip border-soft-3 bg-soft text-primary-container">Summary preview</span>
              </div>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {preview.questions.filter((q) => q.question !== 'valuation').map((q) => {
                  const tone = q.status === 'serious' ? 'border-bad-line bg-bad-fill' : q.status === 'attention' ? 'border-warn-line bg-warn-fill' : 'border-line bg-surface';
                  return (
                    <li key={q.question} className={`rounded-xl border p-3 ${tone}`}>
                      <p className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-label">{QUESTION_TITLES[q.question]?.short}<StatusChip status={q.status} label={statusLabel(q.question, q.status)} /></p>
                      <p className="mt-1.5 text-sm font-semibold text-ink">{summaryLine(q.headlineKey)}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/v/${preview.vehicle.vehicleRef}`} className="btn btn-focal">View Full Car Check</Link>
                <Link href="/sign-up" className="btn btn-ghost">Create a free account</Link>
              </div>
            </div>
            <div className="flex flex-col gap-4 border-t border-line bg-soft p-5 md:p-7 lg:border-l lg:border-t-0">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Image src="/images/mechanic.webp" alt="A mechanic checking a car’s engine bay" fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" />
                <span className="absolute bottom-3 left-3 rounded bg-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">Approved garages and inspectors</span>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-label">Typical market price</p>
                <p className="mt-1 font-display text-lg font-bold text-primary">See the estimated price range</p>
                <p className="text-sm text-muted">From comparable sales of similar cars in Uganda, adjusted for this car’s history. Free. Just log in.</p>
                <Link href={`/sign-in?next=/v/${preview.vehicle.vehicleRef}`} className="link mt-2 inline-block text-sm">Log in to see the price</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* The seven questions */}
      <section className="border-t border-line bg-white" aria-labelledby="questions">
        <div className="mx-auto max-w-[1280px] px-4 py-16 md:px-8 lg:px-12">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-container">Your car, explained</p>
              <h2 id="questions" className="mt-2 font-display text-3xl font-extrabold leading-tight text-primary md:text-4xl">What can I find out<br />about a car?</h2>
            </div>
            <p className="max-w-sm text-muted">SAZO brings together what is available and explains it in seven questions, including when we simply don’t know yet.</p>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUESTION_ORDER.map((q, i) => (
              <li key={q} className={`card p-5 ${q === 'valuation' ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${q === 'valuation' ? 'bg-lime text-ink' : 'bg-soft text-primary-container'}`}><Icon name={QUESTION_ICONS[q]!} size={22} /></span>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-label">Question {i + 1}</p>
                <h3 className="mt-1 font-display text-lg font-bold text-primary">{QUESTION_TITLES[q]!.ask}</h3>
                <p className="mt-1 text-sm text-muted">{QUESTION_BLURBS[q]}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1280px] px-4 py-16 text-center md:px-8 lg:px-12" aria-labelledby="how-h">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-container">Simple by design</p>
        <h2 id="how-h" className="mt-2 font-display text-3xl font-extrabold text-primary md:text-4xl">Checking a car is easy</h2>
        <ol className="mt-10 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Enter the number', 'Type the registration or VIN from the car. If the plate is on more than one car, we show them all and warn you.'],
            ['See what we found', 'We bring the available records into one clear view, with how sure each answer is.'],
            ['Read the important bits', 'History, mileage and key details are easy to understand. Log in for the evidence behind each answer.'],
            ['Decide for yourself', 'See the car, check its papers and get it inspected, with better questions to ask.'],
          ].map(([t, d], i) => (
            <li key={t} className="card relative p-5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${i === 0 ? 'bg-lime text-ink' : 'bg-soft text-primary-container'}`}>{i + 1}</span>
              <span aria-hidden data-n={`0${i + 1}`} className="absolute right-5 top-4 font-display text-4xl font-extrabold text-soft-3 before:content-[attr(data-n)]" />
              <h3 className="mt-4 font-display text-lg font-bold text-primary">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Sellers and businesses */}
      <section className="mx-auto grid max-w-[1280px] gap-6 px-4 pb-4 md:px-8 lg:grid-cols-2 lg:px-12">
        <div className="card overflow-hidden">
          <div className="relative aspect-[16/9]">
            <Image src="/images/handshake.webp" alt="A car seller and a buyer shaking hands" fill sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />
          </div>
          <div className="p-6">
            <p className="text-[11px] font-bold uppercase tracking-wider text-label">For sellers</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-primary">Selling your car? Give buyers more confidence.</h2>
            <p className="mt-2 text-muted">Check your car, confirm you own it, and share the check with a link. A clearer story helps serious buyers move with confidence.</p>
            <Link href="/#check" className="btn btn-focal mt-4">Check My Car</Link>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[14px] bg-primary-container p-6 text-white md:p-8">
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
          <span className="inline-block rounded-full bg-lime px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-ink">For businesses</span>
          <h2 className="mt-4 font-display text-3xl font-extrabold">Run a business with cars?</h2>
          <p className="mt-2 max-w-md text-white/85">Garages, inspectors and dealers add to car histories and build a trusted record of their own.</p>
          <ul className="mt-5 space-y-2 text-white/90">
            {['Garage app: record jobs, even without signal', 'Inspection checklist with photos and paint readings', 'Dealer stock with a shareable check for every car'].map((t) => (
              <li key={t} className="flex items-start gap-2"><Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-lime" />{t}</li>
            ))}
          </ul>
          <Link href="/business" className="btn btn-focal mt-6">For Businesses</Link>
        </div>
      </section>
    </>
  );
}
