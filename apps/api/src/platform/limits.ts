// Per-person and per-business limits (security review S4, S5). The check and the write happen in one
// transaction behind an advisory lock on the limit's key, so requests sent at the same moment cannot
// all pass the count before any of them is written.
import type { Sql } from './sql.js';

/** A limit was reached. The API answers 429 with the message, written for the person who hit it. */
export class LimitReached extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Inside a transaction: lock `key`, run `countSql` (must return one row with column `n`), and refuse when
 * `n` has reached `max`. The caller then writes in the same transaction.
 */
export async function enforceLimit(tx: Sql, key: string, max: number, countSql: string, params: unknown[], message: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  const { rows } = await tx.query<{ n: number }>(countSql, params);
  if ((rows[0]?.n ?? 0) >= max) throw new LimitReached(message);
}
