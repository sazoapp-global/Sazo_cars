/**
 * Plate badge from the designs: a dark navy plate with a lime "UG" tag ("UG | UBK 482M").
 * Identifiers use tabular figures so 0/O and 1/I can't be confused.
 */
export function Plate({ value, size = 'md', tone = 'dark' }: { value: string; size?: 'sm' | 'md' | 'lg'; tone?: 'dark' | 'light' }) {
  const text = size === 'lg' ? 'text-lg gap-2 pl-1.5 pr-3 py-1' : size === 'sm' ? 'text-xs gap-1.5 pl-1 pr-2 py-0.5' : 'text-sm gap-2 pl-1 pr-2.5 py-1';
  const tag = size === 'lg' ? 'text-xs px-1.5 py-0.5' : 'text-[10px] px-1 py-px';
  const colours = tone === 'dark' ? 'bg-ink text-white' : 'bg-soft-3 text-primary';
  return (
    <span className={`sazo-id inline-flex shrink-0 items-center whitespace-nowrap rounded-md font-extrabold ${colours} ${text}`}>
      <span className="rounded bg-lime font-black text-ink" aria-hidden><span className={`block ${tag}`}>UG</span></span>
      <span className="sr-only">Plate </span>{value}
    </span>
  );
}
