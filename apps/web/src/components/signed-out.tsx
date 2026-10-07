import Link from 'next/link';
import { Icon } from './icon';

export function SignInPrompt({ next, what }: { next: string; what: string }) {
  return (
    <div className="card mx-auto mt-6 max-w-lg p-6 text-center">
      <Icon name="lock" size={32} className="mx-auto text-primary-container" />
      <h2 className="mt-2 font-display text-xl font-bold">Sign in to see {what}</h2>
      <p className="mt-1 text-muted">It&apos;s free. We&apos;ll send a code to your phone.</p>
      <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="btn btn-primary mt-4">Sign in</Link>
    </div>
  );
}
