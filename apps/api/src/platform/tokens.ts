import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/** Injection tokens for the shared Postgres pool and Drizzle instance. */
export const DB_POOL = Symbol('DB_POOL');
export const DB = Symbol('DB');
export type Db = NodePgDatabase;
