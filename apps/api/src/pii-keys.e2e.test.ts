// Rotating the personal-data key on a real database: old records still open, `pii:rotate` moves them to the
// new key, and afterwards the old key can be removed.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { PartiesService } from './modules/obs/index.js';

const base = process.env.TEST_DATABASE_URL;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe.skipIf(!base)('personal-data key rotation (e2e)', () => {
  const dbName = `sazo_keys_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const url = new URL(base!);
  url.pathname = `/${dbName}`;
  const admin = new pg.Client({ connectionString: base });
  const v1 = randomBytes(32).toString('base64');
  const v2 = randomBytes(32).toString('base64');
  const open = async (keys: string, current?: number): Promise<INestApplication> => {
    const app = await createApp(loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.toString(), PII_KEYS: keys, ...(current ? { PII_CURRENT_KEY_VERSION: String(current) } : {}) }));
    await app.init();
    return app;
  };

  beforeAll(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    execFileSync('node', [path.join(repoRoot, 'db/migrate.mjs')], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
  }, 60_000);

  afterAll(async () => {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName]);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('old records open with the old key, move to the new key, then the old key can go', async () => {
    const a1 = await open(`1:${v1}`);
    const id = await a1.get(PartiesService).recordPerson({ name: 'Peter Okello', phone: '+256772555123' });
    await a1.close();

    const a2 = await open(`1:${v1},2:${v2}`, 2);
    const parties = a2.get(PartiesService);
    expect(await parties.reveal(id)).toEqual({ name: 'Peter Okello', phone: '+256772555123' });
    expect(await parties.reencryptBatch()).toBe(1);
    expect(await parties.reencryptBatch()).toBe(0);
    await a2.close();

    const a3 = await open(`2:${v2}`);
    expect(await a3.get(PartiesService).reveal(id)).toEqual({ name: 'Peter Okello', phone: '+256772555123' });
    await a3.close();
    const db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    const { rows } = await db.query(`SELECT key_version, name_ciphertext::text LIKE '%Peter%' AS plain FROM pii.parties WHERE id = $1`, [id]);
    await db.end();
    expect(rows[0]).toEqual({ key_version: 2, plain: false });
  });
});
