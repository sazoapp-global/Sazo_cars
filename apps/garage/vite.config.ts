import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The garage app talks to the API on the SAME origin (/v1): in development Vite forwards it;
// in production a reverse proxy serves the app and the API together. No CORS, no third-party requests.
const API = process.env.SAZO_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SAZO Garage',
        short_name: 'SAZO Garage',
        description: 'Record garage jobs for SAZO vehicle histories — works without signal.',
        lang: 'en-UG',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f9f9ff',
        theme_color: '#002177',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only. API answers are never cached by the service worker: drafts live in IndexedDB.
        // Only the Latin fonts are kept offline (other alphabets download if ever needed).
        globPatterns: ['**/*.{js,css,html,svg}', '**/*-latin-{wght,700,800}-normal-*.woff2'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/v1\//],
      },
    }),
  ],
  server: { port: 3002, proxy: { '/v1': { target: API, changeOrigin: false } } },
  preview: { port: 3002, proxy: { '/v1': { target: API, changeOrigin: false } } },
  build: { target: 'es2022', sourcemap: true },
});
