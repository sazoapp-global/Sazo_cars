import Link from 'next/link';

/** Inside a dealer workspace: a car or page that is not there (or not this business's). */
export default function DealerNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-2xl font-bold">We couldn&apos;t find that</h1>
      <p className="mt-1 text-muted">The car may have been removed from your stock, or the link belongs to another business. Open your business from the list and try again.</p>
      <Link href="/business" className="btn btn-primary mt-4">Your businesses</Link>
    </div>
  );
}
