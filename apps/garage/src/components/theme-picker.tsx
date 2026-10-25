import { useState } from 'react';
import { setThemeChoice, themeChoice, type ThemeChoice } from '../lib/theme';
import { Icon, type IconName } from './icon';

// The app runs on phones, tablets and computers, so "system" follows whichever device it is on.
const OPTIONS: [ThemeChoice, string, IconName][] = [['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode'], ['system', 'Same as device', 'devices']];

/** Light, dark, or follow the device (D-112). A list in the navy side menu; three equal tiles elsewhere. */
export function ThemePicker({ onNavy = false }: { onNavy?: boolean }) {
  const [choice, setChoice] = useState(themeChoice);
  const pick = (v: ThemeChoice) => { setThemeChoice(v); setChoice(v); };

  if (onNavy) {
    return (
      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-white/75">Appearance</legend>
        <div className="space-y-0.5">
          {OPTIONS.map(([v, label, icon]) => (
            <button key={v} type="button" aria-pressed={choice === v} onClick={() => pick(v)}
              className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm ${choice === v ? 'bg-white/15 font-semibold text-white' : 'text-white/80 hover:bg-white/10'}`}>
              <Icon name={icon} size={18} className={choice === v ? 'text-lime' : 'text-white/70'} />
              <span className="flex-1">{label}</span>
              {choice === v && <Icon name="check" size={16} className="text-lime" />}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend className="label">Appearance</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(([v, label, icon]) => (
          <button key={v} type="button" aria-pressed={choice === v} onClick={() => pick(v)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border-2 px-1 text-xs font-semibold ${choice === v
              ? 'border-primary-container bg-soft text-primary-container'
              : 'border-line bg-card text-muted hover:border-line-strong'}`}>
            <Icon name={icon} size={20} />
            <span className="text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
