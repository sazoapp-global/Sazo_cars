#!/usr/bin/env node
// SAZO migration runner.
//   node db/migrate.mjs          apply pending migrations in db/migrations (in filename order)
//   node db/migrate.mjs --test   apply migrations, then run every db/tests/*.sql (each must roll itself back)
//
// After migrating it applies db/privileges.sql: the limited `sazo_app` login the API uses in production.
//
// Each migration runs in its own transaction and is recorded in public.sazo_migrations with a
// SHA-256 checksum. Editing an already-applied migration is refused: write a new migration instead.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
// Local development: the project's .env (also read by docker compose) can set SAZO_DB_PORT or DATABASE_URL.
// Values already set in the window win; never read in production.
const envFile = path.join(here, '..', '.env');
if (process.env.NODE_ENV !== 'production' && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    const q = /^(['"])(.*)\1$/.exec(m[2]);
    process.env[m[1]] = q ? q[2] : m[2].replace(/\s+#.*$/, '');
  }
}
const url = process.env.DATABASE_URL || `postgres://sazo:sazo@127.0.0.1:${process.env.SAZO_DB_PORT?.trim() || '5433'}/sazo`;
const runTests = process.argv.includes('--test');

// The database may still be starting (e.g. just after `docker compose up`): keep trying for up to a minute.
async function connect() {
  const deadline = Date.now() + 60_000;
  for (let attempt = 1; ; attempt++) {
    const c = new pg.Client({ connectionString: url });
    try {
      await c.connect();
      return c;
    } catch (err) {
      await c.end().catch(() => undefined);
      const retryable = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', '57P03'].includes(err.code); // 57P03: starting up
      if (!retryable || Date.now() > deadline) {
        const where = new URL(url);
        console.error(`\nCould not connect to the database at ${where.hostname}:${where.port || 5432} (${err.code ?? err.message}).`);
        console.error('Check that Docker Desktop is running and the database is up: docker compose ps   (logs: docker compose logs postgres)');
        console.error('If another PostgreSQL is installed on this computer, or Windows has reserved the port, set another one with SAZO_DB_PORT in .env. See docs/RUNNING_LOCALLY.md.');
        process.exit(1);
      }
      if (attempt === 1) process.stdout.write('Waiting for the database to start ');
      process.stdout.write('.');
      await sleep(2000);
    }
  }
}
const client = await connect();

try {
  await client.query(`CREATE TABLE IF NOT EXISTS public.sazo_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Map(
    (await client.query('SELECT name, checksum FROM public.sazo_migrations')).rows.map((r) => [r.name, r.checksum]),
  );

  const dir = path.join(here, 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`Migration ${file} was changed after it was applied. Create a new migration instead.`);
      }
      continue;
    }
    process.stdout.write(`applying ${file} ... `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO public.sazo_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} failed: ${err.message}`, { cause: err });
    }
    console.log('done');
    count++;
  }
  console.log(count ? `${count} migration(s) applied.` : 'Database is up to date.');

  // The API's limited login (sazo_app) gets exactly the rights it needs on whatever now exists.
  try {
    await client.query(await readFile(path.join(here, 'privileges.sql'), 'utf8'));
    console.log('Privileges for sazo_app are up to date.');
  } catch (err) {
    if (err.code !== '42501') throw err;
    console.warn(`! Could not set up the sazo_app login (${err.message}). Ask a database administrator to run db/privileges.sql.`);
  }

  if (runTests) {
    const tdir = path.join(here, 'tests');
    for (const file of (await readdir(tdir)).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = await readFile(path.join(tdir, file), 'utf8');
      try {
        const results = await client.query(sql);
        const sets = Array.isArray(results) ? results : [results];
        const table = sets.filter((r) => r.command === 'SELECT' && r.fields.some((f) => f.name === 'outcome')).pop();
        for (const row of table?.rows ?? []) console.log(`  ${row.outcome === 'PASS' ? '✓' : '✗'} ${row.test}`);
        console.log(`${file}: passed`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`${file}: ${err.message}`, { cause: err });
      }
    }
  }
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
