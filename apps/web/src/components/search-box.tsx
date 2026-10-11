import { Icon } from './icon';

/**
 * Plate / VIN / chassis search, styled as in the designs (white card, "UG" tag, lime button).
 * A plain GET form: works without JavaScript and on slow phones.
 */
export function SearchBox({ defaultValue, autoFocus = false, label = 'Number plate, VIN or chassis number', compact = false }:
  { defaultValue?: string; autoFocus?: boolean; label?: string; compact?: boolean; size?: 'lg' | 'md' }) {
  return (
    <form action="/check" method="get" role="search" className={`w-full ${compact ? '' : 'rounded-[14px] border border-line bg-white p-2 shadow-[0_4px_6px_-1px_rgba(0,51,170,0.05),0_2px_4px_-2px_rgba(11,19,43,0.04)]'}`}>
      <label htmlFor="q" className="sr-only">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <span className="sazo-id pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-md bg-primary-container px-2 py-1.5 text-xs font-extrabold text-white" aria-hidden>UG</span>
          <input id="q" name="q" required minLength={4} maxLength={32} defaultValue={defaultValue} autoFocus={autoFocus}
            autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="Enter registration number or VIN"
            className="field sazo-id !border-transparent !bg-soft !pl-14 !text-[16px] font-semibold placeholder:font-normal placeholder:normal-case placeholder:tracking-normal focus:!border-primary-container focus:!bg-white" />
        </div>
        <button type="submit" className="btn btn-focal whitespace-nowrap shadow-sm sm:w-auto">
          <Icon name="search" /> Check This Car
        </button>
      </div>
    </form>
  );
}
