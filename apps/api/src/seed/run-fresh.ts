// npm run seed:fresh -w @sazo/api — start a DEVELOPMENT database again (10 Nov 2026): empty it, make the tables,
// then load the sample cars and the demo accounts. seed:demo runs once per database, so on a database that already
// has the demo (or where an earlier run stopped part way) this is the one command that loads it again.
//
// Everything in the database is deleted, so it refuses production and any database that is not on this computer.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from '../config.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') throw new Error('Refusing to empty a production database');
const url = config.DATABASE_URL;
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'].includes(host)) {
  console.error(`Refusing: this empties the whole database, and ${host} is not on this computer.`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const db = new URL(url).pathname.slice(1);

console.log(`Emptying the database "${db}" on ${host} ...`);
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const schemas = (await client.query<{ s: string }>(
    `SELECT nspname AS s FROM pg_namespace
      WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%'`)).rows.map((r) => r.s);
  for (const s of schemas) await client.query(`DROP SCHEMA ${client.escapeIdentifier(s)} CASCADE`);
  await client.query('CREATE SCHEMA public');
} finally {
  await client.end();
}

const env = { ...process.env, DATABASE_URL: url };
const api = path.join(root, 'apps/api');
const step = (what: string, cmd: string, args: string[], cwd = root) => {
  console.log(`\n${what} ...`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\nStopped: ${what.toLowerCase()} did not finish (see above).`);
    process.exit(r.status ?? 1);
  }
};
step('Making the tables', 'node', ['db/migrate.mjs']);
step('Loading the sample cars', 'npx', ['tsx', 'src/seed/run-seed.ts'], api);
step('Loading the demo accounts', 'npx', ['tsx', 'src/seed/run-demo.ts'], api);
