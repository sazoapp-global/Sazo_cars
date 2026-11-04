// Local development: read the project's own .env file (the one docker compose also reads), so one line such as
// SAZO_DB_PORT=5440 sets the database port for Docker, the API, the seed scripts and the migrations together.
// Values already set in the window win. Never used in production or in tests.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadLocalEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'test' || env.VITEST) return;
  // src/local-env.ts and dist/local-env.js are both three folders below the project root.
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || env[m[1]!] !== undefined) continue;
    let value = m[2]!;
    const quoted = /^(['"])(.*)\1$/.exec(value);
    value = quoted ? quoted[2]! : value.replace(/\s+#.*$/, '');
    env[m[1]!] = value;
  }
}

/** The local database address when DATABASE_URL is not set: the port comes from SAZO_DB_PORT (default 5433). */
export function localDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `postgres://sazo:sazo@127.0.0.1:${env.SAZO_DB_PORT?.trim() || '5433'}/sazo`;
}
