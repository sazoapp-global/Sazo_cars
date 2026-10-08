// npm run pii:new-key -w @sazo/api -- --version 2
// Makes a new personal-data key and prints the line to add to the settings. Nothing is changed by this script.
//   • With KMS_KEY_ID set: AWS KMS creates the data key and returns it encrypted; only that encrypted form is
//     printed (for PII_KMS_DATA_KEYS). The plain key is never shown.
//   • Without: a random key for PII_KEYS (development and tests only).
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { KMS_CONTEXT } from '../platform/keyring.js';

const { values } = parseArgs({ options: { version: { type: 'string' } } });
const version = Number(values.version);
if (!Number.isInteger(version) || version < 1) {
  console.error('Usage: pii:new-key -- --version <n>   (one higher than the newest version in use)');
  process.exit(2);
}
if (process.env.KMS_KEY_ID) {
  const { KMSClient, GenerateDataKeyCommand } = await import('@aws-sdk/client-kms');
  const client = new KMSClient(process.env.AWS_REGION ? { region: process.env.AWS_REGION } : {});
  const r = await client.send(new GenerateDataKeyCommand({ KeyId: process.env.KMS_KEY_ID, KeySpec: 'AES_256', EncryptionContext: { ...KMS_CONTEXT, version: String(version) } }));
  console.log(`Add to PII_KMS_DATA_KEYS:  ${version}:${Buffer.from(r.CiphertextBlob!).toString('base64')}`);
} else {
  console.log(`Add to PII_KEYS (development only):  ${version}:${randomBytes(32).toString('base64')}`);
}
console.log(`Then set PII_CURRENT_KEY_VERSION=${version}, restart, and run: npm run pii:rotate -w @sazo/api`);
