// npm run seed:check -w @sazo/api — verify a seeded database: every scenario vehicle's stored verdict
// must equal its expected outcome (Rule Set v1 §12). Vehicles are found by their VIN/chassis anchor.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SCENARIOS } from '@sazo/scenarios';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { VehicleRegistry } from '../modules/vehicle/index.js';
import { compareWithExpectations } from './compare.js';
import type { SeededVehicle } from './scenario-seed.js';

const config = loadConfig();
const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), { logger: ['error'] });
const registry = app.get(VehicleRegistry);
const seeded: SeededVehicle[] = [];
for (const s of SCENARIOS) {
  if (s.id === 'S24-pre') continue;
  const anchor = s.vehicle.identifiers.find((i) => i.type === 'vin' || i.type === 'chassis_number');
  const plate = s.vehicle.identifiers.find((i) => i.type === 'registration_plate');
  const found = await registry.search((anchor ?? plate)!.value);
  const card = found.matches[0];
  if (!card) { console.log(`${s.id}: not found`); continue; }
  seeded.push({ scenarioId: s.id, vehicleId: (await registry.idForRef(card.vehicleRef))!, vehicleRef: card.vehicleRef });
}
const mismatches = await compareWithExpectations(app, seeded);
for (const m of mismatches) console.log(`✗ ${m.scenarioId} ${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`);
console.log(mismatches.length ? `\n${mismatches.length} mismatch(es)` : `✓ all ${seeded.length} scenario vehicles match their expected outcomes`);
await app.close();
process.exitCode = mismatches.length ? 1 : 0;
