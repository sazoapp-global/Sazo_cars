// Light / dark / same as the device (D-112). Remembered in a cookie on this browser, so the server can
// draw the right colours at once; "same as device" is drawn by the stylesheet (prefers-color-scheme), so no
// script has to run before the first paint.
export type ThemeChoice = 'light' | 'dark' | 'system';
export const THEME_COOKIE = 'sazo_theme';
export const parseTheme = (v: string | undefined): ThemeChoice => (v === 'light' || v === 'dark' ? v : 'system');

