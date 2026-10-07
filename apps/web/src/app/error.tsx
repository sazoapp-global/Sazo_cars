'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12" role="alert">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="mt-1 text-muted">This is on our side. Your connection may also be slow — please try again.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-4">Try again</button>
    </div>
  );
}
