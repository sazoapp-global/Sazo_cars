import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

// Tests run against TypeScript sources directly (no build step needed).
export default defineConfig({
  resolve: {
    alias: {
      '@sazo/contracts': src('contracts'),
      '@sazo/trust-engine': src('trust-engine'),
      '@sazo/scenarios': src('scenarios'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
  },
});
