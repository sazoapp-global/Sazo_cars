import { useEffect, useId, useRef, useState } from 'react';
import { setThemeChoice, themeChoice, type ThemeChoice } from '../lib/theme';
import { Icon, type IconName } from './icon';

// The app runs on phones, tablets and computers, so "system" follows whichever device it is on.
const OPTIONS: [ThemeChoice, string, IconName][] = [['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode'], ['system', 'Same as device', 'devices']];

/**
 * Light, dark, or follow the device (D-112), as one row that opens a dropdown. In the navy side menu the
 * list opens upwards (the row sits near the bottom); on the More screen it opens downwards.
 */
export function ThemePicker({ onNavy = false }: { onNavy?: boolean }) {
  const [choice, setChoice] = useState(themeChoice);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = OPTIONS.find(([v]) => v === choice) ?? OPTIONS[2]!;

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [open]);

  const pick = (v: ThemeChoice) => { setThemeChoice(v); setChoice(v); setOpen(false); };

  return (
    <div ref={box} className="relative">
      <p aria-hidden className={onNavy ? 'mb-1 text-xs font-semibold text-white/75' : 'label'}>Appearance</p>
      <button type="button" aria-expanded={open} aria-controls={listId} aria-label={`Appearance: ${current[1]}`} onClick={() => setOpen((o) => !o)}
        className={onNavy
          ? 'flex h-10 w-full items-center gap-2.5 rounded-md bg-white/10 px-2.5 text-left text-sm text-white/90 hover:bg-white/15'
          : 'flex min-h-12 w-full items-center gap-3 rounded-lg border-2 border-line bg-card px-3 text-left font-semibold hover:border-line-strong'}>
        <Icon name={current[2]} size={18} className={onNavy ? 'text-lime' : 'text-primary-container'} />
        <span className={`flex-1 truncate ${onNavy ? 'font-semibold text-white' : 'text-ink'}`}>{current[1]}</span>
        <Icon name="keyboard_arrow_down" size={18} className={`transition-transform ${open ? 'rotate-180' : ''} ${onNavy ? 'text-white/70' : 'text-label'}`} />
      </button>
      {open && (
        <div id={listId} role="group" aria-label="Appearance"
          className={`absolute inset-x-0 z-30 rounded-lg border p-1 shadow-xl ${onNavy ? 'bottom-full mb-1 border-white/15 bg-primary-container' : 'top-full mt-1 border-line bg-card'}`}>
          {OPTIONS.map(([v, label, icon]) => (
            <button key={v} type="button" aria-pressed={choice === v} onClick={() => pick(v)}
              className={`flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm ${onNavy
                ? (choice === v ? 'bg-white/15 font-semibold text-white' : 'text-white/85 hover:bg-white/10')
                : (choice === v ? 'bg-soft font-semibold text-primary-container' : 'text-ink hover:bg-soft')}`}>
              <Icon name={icon} size={18} className={onNavy ? (choice === v ? 'text-lime' : 'text-white/70') : ''} />
              <span className="flex-1">{label}</span>
              {choice === v && <Icon name="check" size={16} className={onNavy ? 'text-lime' : 'text-primary-container'} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
