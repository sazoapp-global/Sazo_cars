// npm run seed -w @sazo/api — load the scenario vehicles into an EMPTY development database.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import pg from 'pg';
import { loadConfig } from '../config.js';
import { DB_POOL } from '../platform/tokens.js';
import { seedScenarios } from './scenario-seed.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('Refusing to seed fictional scenario data into production');
const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), { logger: ['error', 'warn'] });
// Run once per database (1 Nov 2026): a second run used to stop with "Cannot read properties of undefined".
const done = await app.get<pg.Pool>(DB_POOL).query(`SELECT 1 FROM ingest.submissions WHERE idempotency_key LIKE 'seed-%' LIMIT 1`);
if (done.rowCount) {
  console.log('The scenario vehicles are already loaded in this database, so there is nothing to do.');
  console.log('To start again: recreate the database, run "npm run db:migrate", then run this again.');
  await app.close();
  process.exit(0);
}
const seeded = await seedScenarios(app, { log: (m) => console.log(m) });
console.log('\nScenario vehicles (try GET /v1/vehicles/<ref>/summary):');
for (const s of seeded) console.log(`  ${s.scenarioId.padEnd(5)} ${s.vehicleRef}`);
await app.close();
