#!/usr/bin/env node
// SAZO migration runner.
//   node db/migrate.mjs          apply pending migrations in db/migrations (in filename order)
//   node db/migrate.mjs --test   apply migrations, then run every db/tests/*.sql (each must roll itself back)
//
// Each migration runs in its own transaction and is recorded in public.sazo_migrations with a
// SHA-256 checksum. Editing an already-applied migration is refused: write a new migration instead.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL ?? 'postgres://sazo:sazo@localhost:5432/sazo';
const runTests = process.argv.includes('--test');

const client = new pg.Client({ connectionString: url });
await client.connect();

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
