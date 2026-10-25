'use client';
// Settings: light, dark, or follow the phone or computer (D-112), as one row that opens a dropdown, the same as
// in the garage app (25 Oct 2026).
import { useEffect, useId, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/icon';
import type { ThemeChoice as Choice } from '@/lib/theme';
import { chooseTheme, currentChoice } from './theme-client';

const OPTIONS: [Choice, string, IconName][] = [['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode'], ['system', 'Same as device', 'devices']];

export function ThemeChoice() {
  const [choice, setChoice] = useState<Choice>();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    const sync = () => setChoice(currentChoice());
    sync();
    window.addEventListener('sazo-theme', sync);
    return () => window.removeEventListener('sazo-theme', sync);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [open]);
  const current = OPTIONS.find(([v]) => v === choice) ?? OPTIONS[2]!;
  const pick = (v: Choice) => { chooseTheme(v); setChoice(v); setOpen(false); };

  return (
    <div ref={box} className="relative max-w-sm">
      <button type="button" aria-expanded={open} aria-controls={listId} aria-label={`Appearance: ${current[1]}`} onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-3 rounded-lg border-2 border-line bg-card px-3 text-left font-semibold hover:border-line-strong">
        <Icon name={current[2]} size={18} className="text-primary-container" />
        <span className="flex-1 truncate text-ink">{current[1]}</span>
        <Icon name="keyboard_arrow_down" size={18} className={`text-label transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={listId} role="group" aria-label="Appearance" className="absolute inset-x-0 top-full z-30 mt-1 rounded-lg border border-line bg-card p-1 shadow-xl">
          {OPTIONS.map(([v, label, icon]) => (
            <button key={v} type="button" aria-pressed={choice === v} onClick={() => pick(v)}
              className={`flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm ${choice === v ? 'bg-soft font-semibold text-primary-container' : 'text-ink hover:bg-soft'}`}>
              <Icon name={icon} size={18} />
              <span className="flex-1">{label}</span>
              {choice === v && <Icon name="check" size={16} className="text-primary-container" />}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-sm text-muted">Saved on this browser.</p>
    </div>
  );
}
