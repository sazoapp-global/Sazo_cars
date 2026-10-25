import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { missingMigrations } from './platform/migrations-check.js';

const config = loadConfig();
if (config.NODE_ENV !== 'production') {
  const missing = await missingMigrations(config.DATABASE_URL);
  if (missing?.length) {
    console.error(`\nThe database is behind the code: ${missing.length} change(s) not applied yet (${missing.join(', ')}).\n`
      + 'Stop the API, run   npm run db:migrate   and start it again.\n');
    process.exit(1);
  }
}
const app = await createApp(config);
await app.listen(config.PORT);
console.log(`SAZO API listening on http://localhost:${config.PORT}/v1 (simulated data: ${config.SIMULATED_DATA})`);
