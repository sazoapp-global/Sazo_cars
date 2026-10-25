import Link from 'next/link';

/** A dealer's car link that is wrong or no longer exists. */
export default function CarLinkNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-2xl font-bold">This car link doesn&apos;t work</h1>
      <p className="mt-1 text-muted">The link may be mistyped, or the dealer has taken it down. Ask the dealer to send it again, or look the car up by its number plate.</p>
      <Link href="/#check" className="btn btn-primary mt-4">Check a car</Link>
    </div>
  );
}
