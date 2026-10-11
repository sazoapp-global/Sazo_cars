import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon, type IconName } from '@/components/icon';
import { SearchBox } from '@/components/search-box';
import { api, isSignedIn } from '@/lib/api';

export const metadata: Metadata = { title: 'Welcome', robots: { index: false } };

type Profile = { firstName: string | null; email: string | null; progress: { percent: number; items: { key: string; label: string; done: boolean }[] } };

const PATHS: { icon: IconName; title: string; text: string; href: string; cta: string; popular?: boolean }[] = [
  { icon: 'directions_car', title: 'I’m shopping for a car', text: 'Check plates before you go to see a car, save the ones you like and compare up to three side by side.', href: '/compare', cta: 'Compare cars', popular: true },
  { icon: 'key', title: 'I already own a car', text: 'Show SAZO it’s yours to see every garage visit recorded on it, and confirm or question each one.', href: '/my-cars', cta: 'Add my car' },
  { icon: 'storefront', title: 'I work with cars', text: 'Garages, dealers and inspectors: register your business and add your work to each car’s record.', href: '/business', cta: 'For businesses' },
];

/** After a new account: what brought you here? Each answer goes straight to the part of SAZO that helps. */
export default async function Welcome() {
  if (!(await isSignedIn())) redirect('/sign-in');
  const p = await api<Profile>('/me/profile', { auth: true }).catch(() => undefined);
  const todo = p?.progress.items.filter((i) => !i.done) ?? [];
  return (
    <div className="bg-gradient-to-b from-soft to-surface">
      <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-10 lg:px-12">
        <ol aria-label="Getting started" className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm md:p-5">
          <li className="flex items-center gap-2 font-semibold"><span className="grid size-7 place-items-center rounded-full bg-lime text-ink"><Icon name="check" size={16} /></span>Account created</li>
          <li aria-hidden className="hidden h-0.5 w-10 bg-lime sm:block" />
          <li aria-current="step" className="flex items-center gap-2 font-semibold text-primary-container"><span className="grid size-7 place-items-center rounded-full bg-primary-container text-white">2</span>What brings you here</li>
        </ol>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <span className="chip border-transparent bg-lime text-ink">Welcome</span>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Welcome to SAZO{p?.firstName ? `, ${p.firstName}` : ''}</h1>
            <p className="mt-2 max-w-2xl text-muted">Whether you’re buying a car, checking one right now or looking after your own, start where it helps you most.</p>

            <section aria-labelledby="check-now" className="card mt-6 p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-soft text-primary-container"><Icon name="document_scanner" size={24} /></span>
                <div className="min-w-0 flex-1">
                  <h2 id="check-now" className="font-display text-lg font-bold">I have a car to check right now</h2>
                  <p className="text-muted">Enter its number plate or chassis number for the seven buyer questions.</p>
                  <div className="mt-3"><SearchBox label="Number plate, VIN or chassis number" /></div>
                </div>
              </div>
            </section>

            <ul className="mt-4 space-y-4">
              {PATHS.map((x) => (
                <li key={x.title}>
                  <Link href={x.href} className="card group flex items-start gap-3 p-5 transition-colors hover:!border-primary-container">
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-soft text-primary-container"><Icon name={x.icon} size={24} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">{x.title}{x.popular && <span className="chip border-transparent bg-soft-3 text-primary-container">Most common</span>}</span>
                      <span className="block text-muted">{x.text}</span>
                      <span className="mt-2 inline-flex items-center gap-1 font-semibold text-primary-container">{x.cta}<Icon name="arrow_forward" size={18} /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6"><Link href="/" className="link">Skip for now</Link></p>
          </div>

          <aside className="space-y-4">
            {p && (
              <section aria-labelledby="profile" className="card p-5">
                <h2 id="profile" className="font-display font-bold">Your profile</h2>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-soft-3" role="progressbar" aria-label="Your profile" aria-valuenow={p.progress.percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-lime" style={{ width: `${p.progress.percent}%` }} />
                </div>
                <p className="mt-1 text-sm text-muted">{p.progress.percent}% complete</p>
                {todo.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm">{todo.map((i) => <li key={i.key} className="flex gap-2"><Icon name="add_circle" size={18} className="shrink-0 text-primary-container" />{i.label}</li>)}</ul>
                )}
                {todo.length > 0 && <Link href="/account" className="btn btn-ghost mt-4 w-full">Finish my profile</Link>}
              </section>
            )}
            <section aria-labelledby="why" className="rounded-[14px] bg-primary p-5 text-white">
              <h2 id="why" className="font-display font-bold">How SAZO helps</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex gap-2"><Icon name="verified_user" size={20} className="shrink-0 text-lime" /><span><strong>Records, not opinions.</strong> Official, garage and inspection records — each one labelled with where it came from.</span></li>
                <li className="flex gap-2"><Icon name="translate" size={20} className="shrink-0 text-lime" /><span><strong>Plain language.</strong> Seven questions every buyer asks, answered in everyday words.</span></li>
                <li className="flex gap-2"><Icon name="lock" size={20} className="shrink-0 text-lime" /><span><strong>Private.</strong> Owner names are never shown; loans and police records as status only.</span></li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
