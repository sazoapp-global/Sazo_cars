/**
 * Module-boundary rules (D-081). Run with `npm run lint:boundaries`.
 * 1. An API module may use another module ONLY through that module's index.ts (its public interface).
 * 2. Shared packages never import application code.
 * 3. The trust engine stays pure: no database, framework or HTTP libraries.
 * 4. No circular dependencies.
 */
module.exports = {
  forbidden: [
    {
      name: 'module-internals',
      severity: 'error',
      comment: 'Import other modules through their index.ts only (D-081).',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'packages-not-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'trust-engine-is-pure',
      severity: 'error',
      comment: 'Rule Set v1 must stay a pure function: same input, same output (G4).',
      from: { path: '^packages/trust-engine/src/' },
      to: { path: 'node_modules/(pg|drizzle-orm|@nestjs|express|ioredis|bullmq)/' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(dist|node_modules|[.]next|playwright-report|test-results)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.tests.json' },
  },
};
