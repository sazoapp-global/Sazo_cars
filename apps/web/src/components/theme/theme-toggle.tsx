'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icon';
import { chooseTheme, currentChoice, resolved } from './theme-client';

/** Header button: switch between light and dark. (Account settings also offer "same as my device".) */
export function ThemeToggle() {
  const [mode, setMode] = useState<'light' | 'dark'>();
  useEffect(() => {
    const sync = () => setMode(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    sync();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => { if (currentChoice() === 'system') { document.documentElement.dataset.theme = resolved('system'); sync(); } };
    mq.addEventListener('change', onSystem);
    window.addEventListener('sazo-theme', sync);
    return () => { mq.removeEventListener('change', onSystem); window.removeEventListener('sazo-theme', sync); };
  }, []);
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={() => chooseTheme(next)} aria-label={mode ? `Switch to ${next} mode` : 'Switch light or dark mode'}
      className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-soft hover:text-primary-container">
      <Icon name={mode === 'dark' ? 'light_mode' : 'dark_mode'} size={22} />
    </button>
  );
}
