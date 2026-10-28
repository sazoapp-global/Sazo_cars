import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/api';
import { BookingForm } from '@/components/report/booking-form';

export const metadata: Metadata = { title: 'Book an inspection', robots: { index: false } };


export default async function BookInspection({ searchParams }: { searchParams: Promise<{ ref?: string; plate?: string; error?: string }> }) {
  const sp = await searchParams;
  const here = `/inspections/book?${new URLSearchParams({ ...(sp.ref ? { ref: sp.ref } : {}), ...(sp.plate ? { plate: sp.plate } : {}) })}`;
  if (!(await isSignedIn())) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      {sp.ref && <Link href={`/v/${sp.ref}`} className="link text-sm">← Back to the report</Link>}
      <h1 className="mt-2 font-display text-2xl font-bold">Book an inspection</h1>
      <p className="mt-1 text-muted">Ask an inspector approved by SAZO to check the car before you buy. They reply with a day and time, or say they cannot do it. You agree the price with them directly: no money goes through SAZO.</p>
      {sp.error && <p role="alert" className="mt-4 rounded-lg border border-bad-line bg-bad-fill p-3 font-semibold text-bad-text">{sp.error}</p>}
      <BookingForm vehicleRef={sp.ref} plate={sp.plate} />
    </div>
  );
}
