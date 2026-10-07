import Link from 'next/link';
import { SearchBox } from '@/components/search-box';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-1 text-muted">If you followed a link to a vehicle, the reference may be wrong. Try searching again.</p>
      <div className="card mt-6 p-4"><SearchBox size="md" /></div>
      <Link href="/" className="link mt-4 inline-block">Back to the start</Link>
    </div>
  );
}
