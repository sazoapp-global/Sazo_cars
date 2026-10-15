// The sign-in / create-account page from the original design: a two-column layout with what SAZO does on the
// left (a real car's public summary, not invented numbers) and the account card on the right.
import { QUESTION_TITLES, statusLabel } from '@sazo/contracts';
import Image from 'next/image';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';
import { Plate } from '@/components/plate';
import { StatusChip } from '@/components/status';
import { api } from '@/lib/api';
import type { SearchResult, Summary } from '@/lib/types';

const SAMPLE_PLATE = 'UBJ 214K';
const FEATURES: [IconName, string, string][] = [
  ['bookmark', 'Save and share checks', 'Keep the cars you are considering and share a check with a link.'],
  ['fact_check', 'Inspection records', 'Structure, paint readings, tyres and battery from approved inspectors.'],
  ['compare', 'Side-by-side compare', 'Put up to 3 cars next to each other, question by question.'],
  ['policy', 'Police, loan and customs status', 'Whether the records show a stolen report, an active loan or an import problem.'],
];

async function sample(): Promise<Summary | undefined> {
  try {
    const s = await api<SearchResult>(`/vehicles/search?q=${encodeURIComponent(SAMPLE_PLATE)}`);
    const ref = s.outcome === 'found' ? s.matches[0]?.vehicleRef : undefined;
    return ref ? await api<Summary>(`/vehicles/${ref}/summary`) : undefined;
  } catch {
    return undefined;
  }
}

export async function AuthPage({ children, notice }: { children: React.ReactNode; notice?: React.ReactNode }) {
  const preview = await sample();
  const tiles = preview?.questions.filter((q) => ['identity', 'mileage', 'damage'].includes(q.question)) ?? [];
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-lime/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-[1280px] gap-10 px-4 py-10 md:px-8 lg:grid-cols-[1.25fr_1fr] lg:items-start lg:px-12 lg:py-16">
        <div className="order-2 lg:order-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-soft-3 bg-soft px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime"><Icon name="verified" size={14} className="text-ink" /></span>Car checks for Uganda
          </span>
          <h2 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-5xl">Know every car before you commit.</h2>
          <p className="mt-4 max-w-xl text-lg text-muted">Registration, import, garage, inspection, police and loan records about a car, brought together and explained in plain language.</p>

          <div className="card mt-8 p-4">
            <div className="relative aspect-[16/8] overflow-hidden rounded-xl bg-soft">
              <Image src="/images/studio-suv.webp" alt="A crossover car in a studio (illustration)" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" />
              <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-label">Illustration</span>
              {preview?.vehicle.currentPlate && (
                <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-ink/85 px-2 py-1.5 text-white backdrop-blur">
                  <Plate value={preview.vehicle.currentPlate} size="sm" />
                  <span className="pr-1 text-xs font-semibold">{[preview.vehicle.year, preview.vehicle.make, preview.vehicle.model].filter(Boolean).join(' ')} · a real check</span>
                </span>
              )}
            </div>
            {tiles.length > 0 && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {tiles.map((q) => (
                  <li key={q.question} className="rounded-xl bg-soft px-3 py-2.5 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-label">{QUESTION_TITLES[q.question]?.short}</p>
                    <p className="mt-1"><StatusChip status={q.status} label={statusLabel(q.question, q.status)} /></p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(([icon, title, text]) => (
              <li key={title} className="card flex gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-soft text-primary-container"><Icon name={icon} /></span>
                <div><p className="font-display font-bold text-ink">{title}</p><p className="text-sm text-muted">{text}</p></div>
              </li>
            ))}
          </ul>
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-28">
          <div className="card p-6 shadow-[0_20px_25px_-5px_rgba(11,19,43,0.08),0_8px_10px_-6px_rgba(11,19,43,0.04)] md:p-8">
            <div className="flex items-center gap-3">
              <Image src="/images/sazo-logo.webp" alt="" width={48} height={48} className="rounded-xl" />
              <div className="leading-tight">
                <p className="font-display text-xl font-extrabold text-primary">SAZO</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-label">Vehicle intelligence</p>
              </div>
            </div>
            {notice}
            {children}
            <Link href="/business" className="mt-6 flex items-center gap-3 rounded-xl border border-soft-3 bg-soft p-4 hover:border-primary-container">
              <Icon name="storefront" size={24} className="shrink-0 text-primary-container" />
              <span className="flex-1"><span className="block text-sm font-bold text-ink">Garage, dealership or inspector?</span>
                <span className="block text-sm text-muted">Register your business and record history on SAZO.</span></span>
              <Icon name="chevron_right" className="shrink-0 text-primary-container" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
