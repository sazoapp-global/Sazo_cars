// npm run seed -w @sazo/api — load the scenario vehicles into an EMPTY development database.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { seedScenarios } from './scenario-seed.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('Refusing to seed fictional scenario data into production');
const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), { logger: ['error', 'warn'] });
const seeded = await seedScenarios(app, { log: (m) => console.log(m) });
console.log('\nScenario vehicles (try GET /v1/vehicles/<ref>/summary):');
for (const s of seeded) console.log(`  ${s.scenarioId.padEnd(5)} ${s.vehicleRef}`);
await app.close();
