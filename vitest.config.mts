import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// TEST_DATABASE_URL (API tests): forgive quotes and spaces typed around it (Windows Command Prompt keeps
// quotes as part of the value), and stop with a plain explanation when it still is not a database address.
for (const name of ['TEST_DATABASE_URL', 'E2E_DATABASE_URL']) {
  const raw = process.env[name];
  if (raw === undefined) continue;
  const value = raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  if (!value) { delete process.env[name]; continue; }
  if (!URL.canParse(value) || !/^postgres(ql)?:$/.test(new URL(value).protocol)) {
    const shown = value.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:****@');
    throw new Error(`${name} must be a database address like postgres://sazo:sazo@127.0.0.1:5432/sazo_test (got "${shown}"). See docs/RUNNING_LOCALLY.md, step 7.`);
  }
  process.env[name] = value;
}

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
