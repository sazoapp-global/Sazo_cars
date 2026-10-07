// Browser tests for the garage app (built PWA served by `vite preview`) against the real API on a
// seeded database. Needs E2E_DATABASE_URL (CI prepares one; it is shared with the website tests).
import { defineConfig, devices } from '@playwright/test';

export const API_PORT = 3200;
const APP_PORT = 3202;
export const API_LOG = process.env.E2E_GARAGE_API_LOG ?? '/tmp/sazo-e2e-garage-api.log';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    ...devices['Pixel 7'],
    serviceWorkers: 'allow',
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: [
    {
      command: `sh -c "npx tsx src/main.ts > ${API_LOG} 2>&1"`,
      cwd: '../api',
      url: `http://localhost:${API_PORT}/v1/health`,
      env: { DATABASE_URL: process.env.E2E_DATABASE_URL ?? '', PORT: String(API_PORT), NODE_ENV: 'development', EVIDENCE_DIR: '/tmp/sazo-e2e-evidence' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite preview --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      env: { SAZO_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
