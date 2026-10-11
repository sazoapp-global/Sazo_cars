import Link from 'next/link';
import { Icon } from './icon';

export function SignInPrompt({ next, what }: { next: string; what: string }) {
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="card mx-auto mt-6 max-w-lg p-6 text-center">
      <Icon name="lock" size={32} className="mx-auto text-primary-container" />
      <h2 className="mt-2 font-display text-xl font-bold">Log in to see {what}</h2>
      <p className="mt-1 text-muted">It&apos;s free. Create an account with your email or phone number.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href={`/sign-in${q}`} className="btn btn-primary">Log in</Link>
        <Link href={`/sign-up${q}`} className="btn btn-ghost">Create an account</Link>
      </div>
    </div>
  );
}
