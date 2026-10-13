import { useState } from 'react';
import { setThemeChoice, themeChoice, type ThemeChoice } from '../lib/theme';
import { Icon, type IconName } from './icon';

const OPTIONS: [ThemeChoice, string, IconName][] = [['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode'], ['system', 'Same as phone', 'mobile']];

/** Light, dark, or follow the phone (D-112). */
export function ThemePicker({ onNavy = false }: { onNavy?: boolean }) {
  const [choice, setChoice] = useState(themeChoice);
  return (
    <fieldset>
      <legend className={onNavy ? 'mb-1.5 text-xs font-semibold text-white/75' : 'label'}>Appearance</legend>
      <div className={`grid grid-cols-3 gap-1 rounded-lg p-1 ${onNavy ? 'bg-white/10' : 'bg-soft'}`}>
        {OPTIONS.map(([v, label, icon]) => (
          <button key={v} type="button" aria-pressed={choice === v} onClick={() => { setThemeChoice(v); setChoice(v); }}
            className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-semibold leading-tight ${choice === v
              ? (onNavy ? 'bg-white text-primary' : 'bg-card text-primary-container shadow-sm')
              : (onNavy ? 'text-white/85 hover:bg-white/10' : 'text-muted')}`}>
            <Icon name={icon} size={18} />{label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
