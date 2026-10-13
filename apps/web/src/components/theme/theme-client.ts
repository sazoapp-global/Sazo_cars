'use client';
import { THEME_COOKIE, type ThemeChoice } from '@/lib/theme';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function currentChoice(): ThemeChoice {
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)`));
  return m ? (m[1] as ThemeChoice) : 'system';
}

export function resolved(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (media().matches ? 'dark' : 'light') : choice;
}

/** Save the choice for a year on this browser and apply it now. */
export function chooseTheme(choice: ThemeChoice) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = choice === 'system'
    ? `${THEME_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
    : `${THEME_COOKIE}=${choice}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
  document.documentElement.dataset.theme = resolved(choice);
  window.dispatchEvent(new Event('sazo-theme'));
}
