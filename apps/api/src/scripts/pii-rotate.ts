// npm run pii:rotate -w @sazo/api
// After adding a new personal-data key version (and making it current), re-encrypt every record that is still
// on an older key. Safe to stop and run again. When it reports 0 left, the old key can be removed from the settings.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../config.js';
import { AuthService } from '../modules/iam/index.js';
import { PartiesService } from '../modules/obs/index.js';

const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadConfig()), { logger: ['error', 'warn'] });
const parties = app.get(PartiesService);
let total = 0;
for (let n = await parties.reencryptBatch(); n > 0; n = await parties.reencryptBatch()) {
  total += n;
  process.stdout.write(`\rre-encrypted ${total}`);
}
// Dates of birth on accounts (D-101) use the same keys.
const auth = app.get(AuthService);
for (let n = await auth.reencryptDobBatch(); n > 0; n = await auth.reencryptDobBatch()) {
  total += n;
  process.stdout.write(`\rre-encrypted ${total}`);
}
console.log(`\nDone: ${total} record(s) moved to the current key. 0 left on older keys.`);
await app.close();
