// npm run create-admin -w @sazo/api -- --phone +256772000001 --name "Jane Reviewer" [--role sazo_reviewer]
// Creates (or finds) a user by phone and gives them a SAZO platform role. They then sign in with a phone code.
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { IamService } from '../modules/iam/index.js';

const { values } = parseArgs({ options: { phone: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'sazo_admin' } } });
if (!values.phone || !/^\+[1-9][0-9]{7,14}$/.test(values.phone) || !values.name) {
  console.error('Usage: create-admin --phone +2567XXXXXXXX --name "Full Name" [--role sazo_admin|sazo_reviewer]');
  process.exit(2);
}
if (!['sazo_admin', 'sazo_reviewer'].includes(values.role!)) {
  console.error('role must be sazo_admin or sazo_reviewer');
  process.exit(2);
}
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadConfig()), { logger: ['error', 'warn'] });
const id = await app.get(IamService).ensureUser(values.phone, values.name, values.role);
await app.get(IamService).audit({ actor: null, action: 'user.platform_role_granted', targetType: 'user', targetId: id, details: { role: values.role, via: 'create-admin script' } });
console.log(`${values.name} (${values.phone}) now has the ${values.role} role. Sign in with a phone code.`);
await app.close();
