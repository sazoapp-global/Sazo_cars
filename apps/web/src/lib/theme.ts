// Light / dark / same as the device (D-112). Remembered in a cookie on this browser, so the server can
// draw the right colours at once; "same as device" is resolved by a tiny script before the first paint.
export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'sazo_theme';
export const parseTheme = (v: string | undefined): ThemeChoice => (v === 'light' || v === 'dark' ? v : 'system');

/** Runs in <head> before anything is drawn. */
export const THEME_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);var t=m?m[1]:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){}`;
