// Pieces shared by business workspace pages (Partners design). The frame itself is components/app-frame.
/** A ruled row of figures (Partners design): label, number, a short line underneath. */
export function NumberStrip({ cells }: { cells: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' }[] }) {
  return (
    <dl className={`grid grid-cols-2 border-y-2 border-t-ink border-b-line-strong ${cells.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
      {cells.map((c, i) => (
        <div key={c.label} className={`py-3 pr-4 ${i % 2 === 0 ? 'border-r border-line' : 'pl-4 md:border-r md:border-line'} ${i > 0 && i % 2 === 0 ? 'md:pl-4' : ''} ${i < cells.length - 2 ? 'border-b border-line md:border-b-0' : ''} ${i === cells.length - 1 ? 'md:!border-r-0' : ''}`}>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-label">{c.label}</dt>
          <dd className={`font-display text-3xl font-extrabold tabular-nums ${c.tone === 'bad' ? 'text-bad-text' : 'text-ink'}`}>{c.value}</dd>
          {c.sub && <dd className={`text-xs ${c.tone === 'ok' ? 'font-semibold text-ok-text' : 'text-muted'}`}>{c.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
