import { Icon } from './icon';

/** Plate / VIN / chassis search. A plain GET form: works without JavaScript and on slow phones. */
export function SearchBox({ defaultValue, size = 'lg', autoFocus = false }: { defaultValue?: string; size?: 'lg' | 'md'; autoFocus?: boolean }) {
  return (
    <form action="/check" method="get" role="search" className="w-full">
      <label htmlFor="q" className={size === 'lg' ? 'label text-white/90' : 'label'}>Number plate, VIN or chassis number</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <span className="sazo-id pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-md bg-soft-3 px-2 py-1.5 text-xs font-extrabold text-primary" aria-hidden>UG</span>
          <input id="q" name="q" required minLength={4} maxLength={32} defaultValue={defaultValue} autoFocus={autoFocus}
            autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="e.g. UBK 482M"
            className="field sazo-id !pl-14 !text-[17px] font-semibold" />
        </div>
        <button type="submit" className="btn btn-focal sm:w-auto">
          <Icon name="search" /> Check this car
        </button>
      </div>
    </form>
  );
}
