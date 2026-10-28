import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';
import { api, isSignedIn } from '@/lib/api';

const GARAGE_APP_URL = process.env.SAZO_GARAGE_APP_URL ?? 'http://localhost:3002';

export const metadata: Metadata = { title: 'For businesses', description: 'Garages, dealers and inspectors: add your work to every car’s record, win buyers’ trust and keep your own history of every car.' };

type Stats = { vehicles: number; records: number; garages: number; inspectors: number; dealers: number };
const n = (v: number) => v.toLocaleString('en-UG');

const CHAIN: { icon: IconName; title: string; text: string; highlight?: boolean }[] = [
  { icon: 'directions_boat', title: 'Importer', text: 'Where the car came from' },
  { icon: 'storefront', title: 'Dealer', text: 'Shares the car’s check with buyers' },
  { icon: 'fact_check', title: 'Inspector', text: 'Condition on a given day' },
  { icon: 'handyman', title: 'Garage', text: 'Service and repair history' },
  { icon: 'account_balance', title: 'Lender / insurer', text: 'Loans and claims, status only' },
  { icon: 'key', title: 'Buyer', text: 'Buys with a clearer picture', highlight: true },
];

const READY: { icon: IconName; title: string; tag: string; text: string; can: string[]; where: string; type: string; popular?: boolean; also?: { label: string; type: string } }[] = [
  {
    icon: 'storefront', title: 'Car dealers', tag: 'Sell with more confidence', type: 'dealer', where: 'Dealer workspace on this website',
    text: 'List the cars on your yard and send each buyer a link to the car’s check.',
    can: ['List cars with asking price and mileage', 'Share a buyer link for any car', 'Record a sale', 'See which cars have questions in their history'],
  },
  {
    icon: 'handyman', title: 'Garages & service centres', tag: 'Every job becomes part of the car’s record', type: 'garage', where: 'SAZO Garage app on your mechanics’ phones', popular: true,
    text: 'Record jobs from the bay in a minute, even without signal. Customers confirm by SMS.',
    can: ['See the last mileage and engine number SAZO has', 'Record services, repairs and parts with photos', 'Customers confirm each visit by SMS', 'Add your mechanics from the Team screen'],
  },
  {
    icon: 'fact_check', title: 'Inspectors & inspection centres', tag: 'Inspections buyers can rely on', type: 'inspector', where: 'SAZO Inspect app (inspection checklist)',
    also: { label: 'Register as inspection centre', type: 'inspection_centre' },
    text: 'A step-by-step checklist: identity, mileage, paint thickness, structure, tyres and battery.',
    can: ['Work through the checklist on your phone', 'Photos of the car and any damage', 'Paint readings panel by panel', 'Your inspections appear in buyers’ reports'],
  },
];

const LATER: { icon: IconName; title: string; text: string }[] = [
  { icon: 'account_balance', title: 'Banks & lenders', text: 'Check a car before a loan against it.' },
  { icon: 'security', title: 'Insurers', text: 'Know more about the cars you cover.' },
  { icon: 'local_shipping', title: 'Fleets', text: 'Keep every vehicle’s history in one place.' },
  { icon: 'directions_boat', title: 'Importers', text: 'Give every imported car a clear story.' },
];

const BENEFITS: { icon: IconName; title: string; tag: string; items: string[] }[] = [
  { icon: 'payments', title: 'Win customers', tag: 'Buyers choose businesses they can check', items: ['Your business name on the records you add', 'Buyers see confirmed garage visits', 'Dealers share a check with every car'] },
  { icon: 'schedule', title: 'Save time', tag: 'Less paper, fewer phone calls', items: ['Jobs recorded in about a minute', 'Works offline; sends when back online', 'Your own history of every car you touched'] },
  { icon: 'verified_user', title: 'Build trust', tag: 'Checked before you can add records', items: ['SAZO checks every business first', 'Customers confirm visits by SMS', 'Disagreements are reviewed by SAZO'] },
];

const STEPS = [
  'Register your business here (about 5 minutes).',
  'Send your trading licence or registration certificate, and a photo of your premises.',
  'SAZO checks your details. We may call or visit. You get an SMS with the decision.',
  'Once approved, you and your staff log in: dealers on this website, garages and inspectors in the phone app.',
];

const START: { icon: IconName; label: string; type: string }[] = [
  { icon: 'handyman', label: 'I service or repair cars', type: 'garage' },
  { icon: 'storefront', label: 'I sell cars', type: 'dealer' },
  { icon: 'fact_check', label: 'I inspect cars', type: 'inspector' },
  { icon: 'checklist', label: 'I run an inspection centre', type: 'inspection_centre' },
];

export default async function Business() {
  const [signedIn, stats] = await Promise.all([isSignedIn(), api<Stats>('/stats').catch(() => undefined)]);
  const figures = stats ? [
    { v: n(stats.vehicles), l: 'Cars on SAZO' }, { v: n(stats.records), l: 'Records' }, { v: n(stats.garages), l: 'Approved garages' },
  ] : [];
  return (
    <>
      {/* hero */}
      <section className="overflow-hidden bg-gradient-to-b from-soft to-surface">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-10 md:px-8 md:py-16 lg:grid-cols-2 lg:px-12">
          <div>
            <span className="chip border-soft-3 bg-white text-primary-container"><Icon name="workspace_premium" size={14} />Built for people who work with cars</span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-5xl">
              Turn your work on cars into <span className="relative whitespace-nowrap text-primary-container">business value<span aria-hidden className="absolute inset-x-0 -bottom-1 h-2 rounded-full bg-lime" /></span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Garages, dealers and inspectors add what they do to each car’s record. Buyers see it, trust it and choose businesses they can check. Free while SAZO is in testing.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/business/register" className="btn btn-focal">Register your business<Icon name="arrow_forward" size={18} /></Link>
              <a href="#how" className="btn btn-ghost bg-white">How it works</a>
            </div>
            {figures.length > 0 && (
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {figures.map((f) => (
                  <div key={f.l} className="flex flex-col-reverse"><dt className="text-[11px] font-bold uppercase tracking-wider text-label">{f.l}</dt><dd className="font-display text-3xl font-extrabold text-primary-container">{f.v}</dd></div>
                ))}
              </dl>
            )}
            {figures.length > 0 && <p className="mt-2 text-xs text-muted">Live counts. SAZO is in testing. These include simulated records.</p>}
          </div>
          <div className="relative mx-auto w-full max-w-xl">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-xl">
              <Image src="/images/mechanic.webp" alt="" fill priority sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
              <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Illustration</span>
            </div>
            <div className="absolute -bottom-6 -left-2 hidden w-56 overflow-hidden rounded-xl border-4 border-white bg-white shadow-lg sm:block md:-left-8">
              <div className="relative aspect-[4/3]"><Image src="/images/handshake.webp" alt="" fill sizes="224px" className="object-cover" /></div>
              <p className="flex items-center gap-2 p-2 text-xs font-semibold"><Icon name="check_circle" size={16} className="text-ok-text" />History shared with the buyer</p>
            </div>
          </div>
        </div>
      </section>

      {/* already registered */}
      <section className="border-y border-line bg-white" aria-labelledby="have-account">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-8 lg:px-12">
          <div>
            <h2 id="have-account" className="font-display text-xl font-bold">Already registered?</h2>
            <p className="text-muted">{signedIn
              ? 'Your businesses are in your account: check approval, send documents or open your workspace.'
              : 'Log in to see your business, send documents or open your workspace. Mechanics and inspectors log in on the phone app.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {signedIn
              ? <Link href="/account" className="btn btn-primary"><Icon name="person" />Your businesses</Link>
              : <Link href="/sign-in?next=/account" className="btn btn-primary"><Icon name="person" />Log in</Link>}
            <a href={`${GARAGE_APP_URL}/?for=garage`} className="btn btn-ghost"><Icon name="garage" />Open the Garage app</a>
          </div>
        </div>
      </section>

      {/* brokers */}
      <section className="border-b border-line bg-soft/60" aria-labelledby="brokers">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-8 lg:px-12">
          <div>
            <h2 id="brokers" className="font-display text-xl font-bold">Are you a car broker?</h2>
            <p className="text-muted">Share cars from approved dealers with your buyers, keep the customers you bring, and follow your commission. You need your National ID.</p>
          </div>
          <Link href="/broker" className="btn btn-ghost bg-white"><Icon name="handshake" />Brokers</Link>
        </div>
      </section>

      {/* value chain */}
      <section className="mx-auto max-w-[1280px] px-4 py-14 text-center md:px-8 lg:px-12" aria-labelledby="chain">
        <p className="text-[11px] font-bold uppercase tracking-wider text-label">The SAZO network</p>
        <h2 id="chain" className="mx-auto mt-2 max-w-2xl font-display text-3xl font-extrabold text-ink">Every business adds to a car’s story.</h2>
        <p className="mx-auto mt-2 max-w-2xl text-muted">A dealer sells it, a garage services it, an inspector checks it. SAZO brings those records together so the next buyer can see them.</p>
        <ol className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CHAIN.map((c) => (
            <li key={c.title} className={`rounded-[14px] border p-4 ${c.highlight ? 'border-lime bg-lime' : 'border-line bg-white'}`}>
              <Icon name={c.icon} size={28} className={c.highlight ? 'mx-auto text-ink' : 'mx-auto text-primary-container'} />
              <p className="mt-2 font-display font-bold uppercase tracking-wide">{c.title}</p>
              <p className={`text-xs ${c.highlight ? 'text-ink' : 'text-muted'}`}>{c.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 rounded-xl bg-soft px-4 py-3 font-semibold text-primary-container"><Icon name="hub" size={18} className="mr-1 inline align-[-3px]" />The more trusted records a car has, the more useful it is to everyone who works with it.</p>
      </section>

      {/* who it's for */}
      <section className="bg-soft/60" aria-labelledby="who">
        <div className="mx-auto max-w-[1280px] px-4 py-14 md:px-8 lg:px-12">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div><p className="text-[11px] font-bold uppercase tracking-wider text-label">Ready today</p>
              <h2 id="who" className="font-display text-3xl font-extrabold text-ink">One platform. Many businesses.</h2></div>
            <p className="max-w-sm text-muted">Three workspaces are open now. More are planned.</p>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {READY.map((b) => (
              <article key={b.title} className={`card flex flex-col p-5 ${b.popular ? '!border-2 !border-primary-container' : ''}`} aria-labelledby={`b-${b.type}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 id={`b-${b.type}`} className="flex items-center gap-2 font-display text-xl font-bold text-primary-container"><Icon name={b.icon} size={26} />{b.title}</h3>
                  {b.popular && <span className="chip border-transparent bg-lime text-ink">Most used</span>}
                </div>
                <p className="mt-1 text-sm font-semibold text-ok-text">{b.tag}</p>
                <p className="mt-2 text-muted">{b.text}</p>
                <div className="mt-4 rounded-lg bg-soft p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-label">You can</p>
                  <ul className="mt-2 space-y-1.5 text-sm">{b.can.map((c) => <li key={c} className="flex gap-2"><Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-ok-text" />{c}</li>)}</ul>
                </div>
                <p className="mt-3 text-xs text-muted"><Icon name="smart_display" size={14} className="mr-1 inline align-[-2px]" />{b.where}</p>
                <Link href={`/business/register?type=${b.type}`} className={`btn mt-auto ${b.popular ? 'btn-primary' : 'btn-ghost'} mt-4 w-full`}>Register as {b.title.toLowerCase().replace(/ &.*/, '').replace(/s$/, '')}<Icon name="arrow_forward" size={18} /></Link>
                {b.also && <Link href={`/business/register?type=${b.also.type}`} className="btn btn-ghost mt-2 w-full">{b.also.label}<Icon name="arrow_forward" size={18} /></Link>}
              </article>
            ))}
          </div>
          <h3 className="mt-10 font-display text-lg font-bold">Coming later</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LATER.map((l) => (
              <li key={l.title} className="flex items-start gap-3 rounded-[14px] border border-dashed border-line-strong bg-white/70 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-soft text-label"><Icon name={l.icon} size={22} /></span>
                <span><span className="block font-semibold">{l.title}</span><span className="text-sm text-muted">{l.text}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* benefits */}
      <section className="mx-auto max-w-[1280px] px-4 py-14 md:px-8 lg:px-12" aria-labelledby="benefits">
        <h2 id="benefits" className="text-center font-display text-3xl font-extrabold text-ink">What does SAZO do for my business?</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="relative overflow-hidden rounded-[14px] border border-line bg-soft p-6">
              <span className="grid size-11 place-items-center rounded-lg bg-primary-container text-white"><Icon name={b.icon} size={24} /></span>
              <h3 className="mt-4 font-display text-xl font-extrabold uppercase">{b.title}</h3>
              <p className="text-sm font-semibold text-ok-text">{b.tag}</p>
              <ul className="mt-3 space-y-2 text-sm">{b.items.map((i) => <li key={i} className="flex gap-2"><Icon name="check_circle" size={16} className="mt-0.5 shrink-0 text-primary-container" />{i}</li>)}</ul>
              <span aria-hidden className="absolute -bottom-10 -right-10 size-32 rounded-full bg-lime/30" />
            </div>
          ))}
        </div>
      </section>

      {/* how approval works */}
      <section id="how" className="scroll-mt-24 bg-soft/60" aria-labelledby="how-h">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-14 md:px-8 lg:grid-cols-2 lg:px-12">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-label">Getting started</p>
            <h2 id="how-h" className="font-display text-3xl font-extrabold text-ink">How approval works</h2>
            <ol className="mt-5 space-y-3">
              {STEPS.map((t, i) => (
                <li key={t} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-container text-sm font-bold text-white">{i + 1}</span><span className="pt-1">{t}</span></li>
              ))}
            </ol>
          </div>
          <div className="card p-6">
            <h3 className="text-center font-display text-xl font-extrabold">What do you do?</h3>
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {START.map((s) => (
                <li key={s.type}>
                  <Link href={`/business/register?type=${s.type}`} className="flex h-full flex-col items-center gap-2 rounded-xl border-2 border-line bg-white p-4 text-center text-sm font-semibold hover:border-primary-container hover:bg-lime/30">
                    <Icon name={s.icon} size={28} className="text-primary-container" />{s.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-center text-xs text-muted">Lenders, insurers, fleets and importers: these workspaces are not open yet.</p>
          </div>
        </div>
      </section>

      {/* closing */}
      <section className="mx-auto max-w-[1280px] px-4 py-14 md:px-8 lg:px-12">
        <div className="rounded-2xl bg-primary px-6 py-12 text-center text-white md:px-12">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold md:text-4xl">Work with vehicles? Work with SAZO.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">Register once. SAZO checks your business, then your team gets to work.</p>
          <Link href="/business/register" className="btn btn-focal mt-6">Register your business<Icon name="arrow_forward" size={18} /></Link>
        </div>
      </section>
    </>
  );
}
