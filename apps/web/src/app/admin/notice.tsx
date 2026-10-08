/** Shows the outcome of the last admin action (?done= / ?error=). */
export function Notice({ done, error }: { done?: string; error?: string }) {
  if (!done && !error) return null;
  return (
    <p role={error ? 'alert' : 'status'} className={`mb-4 rounded-lg border p-3 text-sm font-semibold ${error ? 'border-bad-line bg-bad-fill text-bad-text' : 'border-ok-line bg-ok-fill text-ok-text'}`}>{error ?? done}</p>
  );
}

export function Forbidden({ what }: { what: string }) {
  return <p className="rounded-lg border border-line bg-na-fill p-4 text-na-text">Your role doesn&apos;t include {what}. Ask a SAZO administrator.</p>;
}

export type SP = Promise<{ done?: string; error?: string; status?: string; topic?: string }>;
