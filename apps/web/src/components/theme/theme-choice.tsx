'use client';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icon';
import type { ThemeChoice as Choice } from '@/lib/theme';
import { chooseTheme, currentChoice } from './theme-client';

const OPTIONS: [Choice, string, IconName][] = [['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode'], ['system', 'Same as device', 'devices']];

/** Settings: light, dark, or follow the phone or computer (D-112). */
export function ThemeChoice() {
  const [choice, setChoice] = useState<Choice>();
  useEffect(() => {
    const sync = () => setChoice(currentChoice());
    sync();
    window.addEventListener('sazo-theme', sync);
    return () => window.removeEventListener('sazo-theme', sync);
  }, []);
  return (
    <fieldset>
      <legend className="sr-only">Appearance</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map(([v, label, icon]) => (
          <label key={v} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 border-line bg-white px-4 font-semibold has-[:checked]:border-primary-container has-[:checked]:bg-soft">
            <input type="radio" name="theme" value={v} checked={choice === v} onChange={() => chooseTheme(v)} className="h-5 w-5 accent-[#0033aa]" />
            <Icon name={icon} size={20} className="text-label" />{label}
          </label>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">Saved on this browser.</p>
    </fieldset>
  );
}
