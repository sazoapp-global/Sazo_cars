// Light / dark / same as the phone (D-112). Remembered on this phone only.
export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'sazo_theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function themeChoice(): ThemeChoice {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

export function applyTheme(choice = themeChoice()) {
  const dark = choice === 'dark' || (choice === 'system' && media().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1020' : '#002177');
}

export function setThemeChoice(choice: ThemeChoice) {
  try { if (choice === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch { /* private mode: applies until reload */ }
  applyTheme(choice);
}

/** Follow the phone's setting while the choice is "same as my phone". */
export function watchSystemTheme() {
  media().addEventListener('change', () => { if (themeChoice() === 'system') applyTheme('system'); });
}
