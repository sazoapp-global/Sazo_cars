// Browser tests for the consumer web app. They start the real API (on a seeded database) and the
// built web app. Needs E2E_DATABASE_URL pointing at a migrated + seeded database (CI prepares one).
import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 3101;
export const API_LOG = process.env.E2E_API_LOG ?? '/tmp/sazo-e2e-api.log';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Admin tests change data (they settle the cloned plate), so they run after the buyer journeys.
  projects: [
    { name: 'buyer', testMatch: /(consumer|buyer-tools)\.spec\.ts/ },
    { name: 'admin', testMatch: /(admin|business|partner|ownership|dealer|concerns)\.spec\.ts/, dependencies: ['buyer'] },
  ],
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    ...devices['Pixel 7'],
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: [
    {
      // Codes are printed to this log by the development SMS sender; the sign-in test reads them there.
      command: `sh -c "npx tsx src/main.ts > ${API_LOG} 2>&1"`,
      cwd: '../api',
      url: `http://localhost:${API_PORT}/v1/health`,
      env: { DATABASE_URL: process.env.E2E_DATABASE_URL ?? '', PORT: String(API_PORT), NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: { SAZO_API_URL: `http://localhost:${API_PORT}`, NEXT_TELEMETRY_DISABLED: '1' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
