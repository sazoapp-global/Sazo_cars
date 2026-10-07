import pg from 'pg';

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Sql = Pick<pg.PoolClient, 'query'>;

/** Run `fn` in a transaction. Commits on success, rolls back on error. */
export async function withTx<T>(pool: pg.Pool, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Short readable reference codes (DM-8): Crockford base32 without I, L, O, U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function publicRef(prefix: 'SZV' | 'SZR' | 'GJ'): string {
  const pick = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join('');
  return `${prefix}-${block()}-${block()}`;
}
