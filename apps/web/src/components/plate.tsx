/** Plate badge (design system: "UG • UBK 482M"). Identifiers use tabular figures so 0/O and 1/I can't be confused. */
export function Plate({ value, size = 'md' }: { value: string; size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-base px-3 py-1' : size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';
  return (
    <span className={`sazo-id inline-block rounded bg-soft-3 font-extrabold text-primary ${text}`}>
      <span aria-hidden>UG • </span><span className="sr-only">Plate </span>{value}
    </span>
  );
}
