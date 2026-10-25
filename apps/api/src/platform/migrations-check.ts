// Start-up check (25 Oct 2026): after pulling new code, a database that has not been migrated breaks pages with
// errors like `column "…" does not exist`. On a developer's computer the API stops at once and says what to run.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../db/migrations');

/** The migration files not yet applied to this database, or undefined when it cannot tell (no files, no access). */
export async function missingMigrations(databaseUrl: string): Promise<string[] | undefined> {
  let files: string[];
  try {
    files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return undefined;
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM public.sazo_migrations')).rows.map((r) => r.name));
    return files.filter((f) => !applied.has(f));
  } catch {
    return undefined;
  } finally {
    await client.end().catch(() => undefined);
  }
}
