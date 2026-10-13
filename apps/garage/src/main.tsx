import '@fontsource-variable/inter';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './styles.css';
import './theme-dark.css';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';

applyTheme();
watchSystemTheme();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
