import Link from 'next/link';
import { SearchBox } from '@/components/search-box';
import { Icon } from '@/components/icon';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-1 text-muted">If you followed a link to a vehicle, the reference may be wrong. Try searching again.</p>
      <div className="card mt-6 p-4"><SearchBox size="md" /></div>
      <Link href="/" className="btn-soft mt-4"><Icon name="arrow_back" />Back to the start</Link>
    </div>
  );
}
