import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';

export const metadata: Metadata = { title: 'For businesses', description: 'Garages: record jobs for your customers’ cars, build a trusted reputation, and keep your own history of every car.' };

const GARAGE_POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'history', title: 'Every car’s history at the bay', text: 'Type the plate and see the last mileage SAZO has and the engine number on record — before you start work.' },
  { icon: 'photo_camera', title: 'Quick jobs, with photos', text: 'Pick the work done, take an odometer photo, done. Works without signal; it sends when you’re back online.' },
  { icon: 'sms', title: 'Customers confirm by SMS', text: 'Your customer gets one SMS to confirm the visit. Confirmed jobs build your garage’s reputation.' },
  { icon: 'verified', title: 'A verified garage', text: 'SAZO checks every garage before it can record history, so buyers can trust what you add.' },
];

export default function Business() {
  return (
    <>
      <section className="bg-primary text-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-8 md:py-14 lg:px-12">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/70">SAZO for businesses</p>
          <h1 className="mt-1 max-w-2xl font-display text-3xl font-extrabold md:text-5xl">Your garage&apos;s work, on every car&apos;s record.</h1>
          <p className="mt-3 max-w-xl text-white/85 md:text-lg">Free while SAZO is in testing. Register your garage, SAZO checks it, and your mechanics start recording jobs from their phones.</p>
          <Link href="/business/register" className="btn btn-focal mt-6">Register your business</Link>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] px-4 py-10 md:px-8 lg:px-12" aria-labelledby="garages">
        <h2 id="garages" className="font-display text-2xl font-bold">For garages</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {GARAGE_POINTS.map((p) => (
            <li key={p.title} className="card flex gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-soft text-primary-container"><Icon name={p.icon} /></span>
              <div><h3 className="font-semibold">{p.title}</h3><p className="text-muted">{p.text}</p></div>
            </li>
          ))}
        </ul>
        <h2 className="mt-10 font-display text-2xl font-bold">How approval works</h2>
        <ol className="mt-3 space-y-2">
          {['Register your business here (5 minutes).', 'Send your trading licence or registration certificate, and a photo of your premises.', 'SAZO checks your details — we may call or visit. You get an SMS with the decision.', 'Once approved, you and your staff sign in to the SAZO Garage app with your phones.'].map((t, i) => (
            <li key={t} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-bold text-white">{i + 1}</span><span className="pt-0.5">{t}</span></li>
          ))}
        </ol>
        <p className="mt-8 text-muted">Inspectors and inspection centres record inspections in the same phone app. Dealers list their cars for sale on this website. Lenders, insurers and fleets: contact SAZO.</p>
      </section>
    </>
  );
}
