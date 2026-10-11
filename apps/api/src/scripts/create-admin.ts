// npm run create-admin -w @sazo/api -- --phone +256772000001 --surname Namukasa --first Jane --gender female --dob 1985-06-01 [--role sazo_reviewer]
// Creates (or finds) a user by phone and gives them a SAZO platform role. With --surname/--first/--gender/--dob
// the account's details are complete (D-101); without them the person is asked for them at first log-in.
// They then log in with a phone code (and, as SAZO staff, a second step on each new device — D-105).
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { PersonDetails } from '@sazo/contracts';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { AuthService, IamService } from '../modules/iam/index.js';

const { values } = parseArgs({ options: {
  phone: { type: 'string' }, name: { type: 'string' }, surname: { type: 'string' }, first: { type: 'string' }, middle: { type: 'string' },
  gender: { type: 'string' }, dob: { type: 'string' }, role: { type: 'string', default: 'sazo_admin' },
} });
const name = values.name ?? [values.first, values.surname].filter(Boolean).join(' ');
if (!values.phone || !/^\+[1-9][0-9]{7,14}$/.test(values.phone) || !name) {
  console.error('Usage: create-admin --phone +2567XXXXXXXX --surname Surname --first First [--middle Middle] --gender female|male --dob YYYY-MM-DD [--role sazo_admin|sazo_reviewer]');
  process.exit(2);
}
if (!['sazo_admin', 'sazo_reviewer'].includes(values.role!)) {
  console.error('role must be sazo_admin or sazo_reviewer');
  process.exit(2);
}
const details = values.surname && values.first && values.gender && values.dob
  ? PersonDetails.safeParse({ surname: values.surname, firstName: values.first, middleName: values.middle, gender: values.gender, dateOfBirth: values.dob })
  : undefined;
if (details && !details.success) {
  console.error(`Check the details: ${details.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  process.exit(2);
}
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadConfig()), { logger: ['error', 'warn'] });
const id = await app.get(IamService).ensureUser(values.phone, name, values.role);
if (details?.success) await app.get(AuthService).completeDetails(id, details.data);
await app.get(IamService).audit({ actor: null, action: 'user.platform_role_granted', targetType: 'user', targetId: id, details: { role: values.role, via: 'create-admin script' } });
console.log(`${name} (${values.phone}) now has the ${values.role} role. Log in with a phone code${details?.success ? '' : ' and finish the details when asked'}.`);
await app.close();
