import { CONFIDENCE_LABELS, QUESTION_ORDER, QUESTION_TITLES, formatKm, formatUgx, headline, statusLabel } from '@sazo/contracts';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icon';
import { StatusChip } from '@/components/status';
import { ApiError, api } from '@/lib/api';
import { QUESTION_ICONS } from '@/lib/questions';
import type { QuestionView, RecordConfidence, VehicleCard } from '@/lib/types';
import { enquire } from './actions';

export const metadata: Metadata = { title: 'Car for sale', robots: { index: false, follow: false }, referrer: 'no-referrer' };

interface CarPage {
  vehicleRef: string; vehicle: VehicleCard | null;
  specs: { make: string | null; model: string | null; year: number | null; engineCc: number | null; fuel: string | null; transmission: string | null; colour: string | null };
  askingPriceUgx: number; listedMileageKm: number | null; tiktokUrl: string | null; photos: string[]; questions: QuestionView[]; recordConfidence: RecordConfidence | null;
  seller: { kind: 'dealer' | 'broker'; name: string | null; dealerName: string | null; whatsapp: string | null };
}

const FUEL: Record<string, string> = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric', lpg: 'Gas (LPG)', other: 'Other fuel' };
const GEAR: Record<string, string> = { automatic: 'Automatic', manual: 'Manual', cvt: 'CVT', other: 'Other gearbox' };
const TOKEN = /^[A-Za-z0-9_-]{20,40}$/;

type SP = Promise<{ sent?: string; error?: string }>;

export default async function CarForSale({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!TOKEN.test(token)) notFound();
  let car: CarPage | undefined;
  let gone = false;
  try { car = await api<CarPage>(`/cars/${token}`); }
  catch (err) { if (err instanceof ApiError && err.status === 410) gone = true; else if (err instanceof ApiError && err.status === 404) notFound(); else throw err; }

  if (gone || !car) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center md:px-8">
        <Icon name="sell" size={40} className="mx-auto text-muted" />
        <h1 className="mt-3 font-display text-2xl font-bold">This car is no longer for sale</h1>
        <p className="mt-2 text-muted">It may have been sold, or the seller stopped sharing it.</p>
        <p className="mt-6"><Link href="/" className="btn btn-primary">Check another car on SAZO</Link></p>
      </div>
    );
  }

  const s = car.specs;
  const name = [s.year, s.make, s.model].filter(Boolean).join(' ') || 'Car for sale';
  const h = await headers();
  const pageUrl = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}/c/${token}`;
  const facts = [s.engineCc ? `${(s.engineCc / 1000).toFixed(1)} L` : null, s.fuel ? FUEL[s.fuel] : null, s.transmission ? GEAR[s.transmission] : null, s.colour,
    car.listedMileageKm !== null ? formatKm(car.listedMileageKm) : null].filter(Boolean) as string[];
  const sellerName = car.seller.name ?? 'The seller';
  const wa = car.seller.whatsapp ? `https://wa.me/${car.seller.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I am interested in the ${name} for ${formatUgx(car.askingPriceUgx, false)}. ${pageUrl}`)}` : null;
  const questions = QUESTION_ORDER.map((k) => car.questions.find((q) => q.question === k)).filter((q): q is QuestionView => !!q);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
      {car.photos.length > 0 && (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" aria-label="Photos">
          {car.photos.map((p, i) => (
            <li key={p} className="w-[85%] shrink-0 snap-center sm:w-[60%]">
              {/* Photos come through this site so the link's token decides access. */}
              <img src={`/c/${token}/photo/${p}`} alt={`${name}, photo ${i + 1} of ${car!.photos.length}`} className="aspect-[4/3] w-full rounded-[14px] border border-line object-cover" />
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="car-name">
        <p className="text-sm font-semibold uppercase tracking-wide text-label">{car.seller.kind === 'broker' ? `Shared by ${sellerName}` : car.seller.name ? `For sale at ${car.seller.name}` : 'For sale'}</p>
        <h1 id="car-name" className="font-display text-3xl font-extrabold tracking-tight">{name}</h1>
        <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-primary-container">{formatUgx(car.askingPriceUgx, false)}</p>
        {facts.length > 0 && <p className="mt-1 text-muted">{facts.join(' · ')}</p>}
        {car.seller.kind === 'broker' && car.seller.dealerName && <p className="mt-1 text-sm text-muted">The car is at {car.seller.dealerName}.</p>}
      </section>

      {sp.sent === '1' && <p role="status" className="rounded-lg border border-ok-line bg-ok-fill p-3 font-semibold text-ok-text">Thank you. {sellerName} will contact you.</p>}
      {sp.error && <p role="alert" className="rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary"><Icon name="chat" />Ask on WhatsApp</a>}
        {car.tiktokUrl && <a href={car.tiktokUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-ghost bg-white"><Icon name="play_circle" />Watch on TikTok</a>}
      </div>

      <section className="rounded-[14px] border border-line p-4 md:p-5" aria-labelledby="records">
        <h2 id="records" className="flex items-center gap-2 font-display text-lg font-bold"><Icon name="fact_check" />What SAZO records show</h2>
        <p className="mt-1 text-sm text-muted">From the records SAZO has for this car. SAZO does not certify a car: always inspect it and check its documents before you pay.</p>
        {car.recordConfidence && <p className="mt-2 text-sm font-semibold">Record confidence: {CONFIDENCE_LABELS[car.recordConfidence.level]}</p>}
        <ul className="mt-3 divide-y divide-line">
          {questions.map((q) => (
            <li key={q.question} className="flex items-start gap-3 py-2">
              <Icon name={QUESTION_ICONS[q.question] ?? 'info'} className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{QUESTION_TITLES[q.question]?.short}</p>
                <p className="text-sm text-muted">{headline(q.headlineKey, q.params)}</p>
              </div>
              <StatusChip status={q.status} label={statusLabel(q.question, q.status)} />
            </li>
          ))}
        </ul>
        <p className="mt-3"><Link href={`/v/${car.vehicleRef}`} className="link">See the SAZO report for this car</Link></p>
      </section>

      <section className="rounded-[14px] border border-line bg-soft/50 p-4 md:p-5" aria-labelledby="ask">
        <h2 id="ask" className="font-display text-lg font-bold">Ask about this car</h2>
        <p className="mt-1 text-sm text-muted">Leave your name and number and {sellerName === 'The seller' ? 'the seller' : sellerName} will call or message you.</p>
        <form action={enquire} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="token" value={token} />
          <div><label htmlFor="name" className="label">Your name</label><input id="name" name="name" required minLength={2} autoComplete="name" className="field" /></div>
          <div><label htmlFor="phone" className="label">Phone number</label><input id="phone" name="phone" type="tel" required autoComplete="tel" className="field" placeholder="0772 123 456" /></div>
          <div className="sm:col-span-2"><label htmlFor="message" className="label">Message (optional)</label><input id="message" name="message" maxLength={500} className="field" placeholder="When can I see it?" /></div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consent" required className="mt-0.5 size-5 shrink-0" />I agree that the seller may contact me about this car. SAZO does not share my number with anyone else.</label>
          <div className="sm:col-span-2"><button className="btn btn-primary"><Icon name="sms" />Send</button></div>
        </form>
      </section>
    </div>
  );
}
