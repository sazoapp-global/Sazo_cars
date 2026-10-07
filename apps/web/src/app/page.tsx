import { QUESTION_ORDER, QUESTION_TITLES } from '@sazo/contracts';
import { Icon, type IconName } from '@/components/icon';
import { SearchBox } from '@/components/search-box';

const QUESTION_ICONS: Record<string, IconName> = {
  identity: 'verified', care: 'build', damage: 'car_crash', mileage: 'speed', provenance: 'public', legal_financial: 'account_balance', valuation: 'sell',
};

export default function Home() {
  return (
    <>
      <section className="bg-primary text-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-8 md:py-16 lg:px-12">
          <h1 className="max-w-2xl font-display text-3xl font-extrabold leading-tight md:text-5xl md:leading-[1.1]">Know the car before you buy it.</h1>
          <p className="mt-3 max-w-xl text-white/85 md:text-lg">Enter a number plate or VIN. SAZO brings together registration, import, garage, police, finance and insurance records and tells you what they show — in plain language.</p>
          <div className="mt-6 max-w-2xl"><SearchBox autoFocus /></div>
          <p className="mt-3 text-sm text-white/80">Free while SAZO is in testing. No account needed for the summary.</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-10 md:px-8 lg:px-12" aria-labelledby="questions">
        <h2 id="questions" className="font-display text-2xl font-bold">Seven questions answered for every car</h2>
        <p className="mt-1 text-muted">Each answer shows how sure the records are — including when we simply don&apos;t know yet.</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUESTION_ORDER.map((q, i) => (
            <li key={q} className="card flex items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-soft text-primary-container"><Icon name={QUESTION_ICONS[q]!} /></span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-label">{i + 1} · {QUESTION_TITLES[q]!.short}</p>
                <p className="font-semibold">{QUESTION_TITLES[q]!.ask}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="how" className="border-y border-line bg-white" aria-labelledby="how-h">
        <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-10 md:grid-cols-3 md:px-8 lg:px-12">
          <h2 id="how-h" className="sr-only">How it works</h2>
          {[
            { icon: 'search' as const, title: 'Search', text: 'Type the plate or VIN. If the plate is on more than one car, we show you all of them — and warn you.' },
            { icon: 'list_alt' as const, title: 'Read the verdict', text: 'Each question gets a clear status and one line of explanation. Sign in to see the evidence behind it.' },
            { icon: 'garage' as const, title: 'Then inspect', text: 'Records help you ask the right questions. Always see the car, check its papers and get an inspection.' },
          ].map((s) => (
            <div key={s.title} className="flex gap-3">
              <Icon name={s.icon} size={28} className="mt-0.5 shrink-0 text-primary-container" />
              <div><h3 className="font-display text-lg font-bold">{s.title}</h3><p className="text-muted">{s.text}</p></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
