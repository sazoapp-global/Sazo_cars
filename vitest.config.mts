import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

// Tests run against TypeScript sources directly (no build step needed).
// SWC is used so NestJS decorator metadata (dependency injection) works in tests.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
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
