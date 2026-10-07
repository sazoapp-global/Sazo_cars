import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config.js';

export const DB_POOL = Symbol('DB_POOL');
export const DB = Symbol('DB');
export type Db = NodePgDatabase;

@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

/** One Postgres pool for the whole app (D-080). Modules query only their own schema (D-081). */
@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 10 }),
    },
    { provide: DB, inject: [DB_POOL], useFactory: (pool: pg.Pool): Db => drizzle(pool) },
    PoolCloser,
  ],
  exports: [DB_POOL, DB],
})
export class DatabaseModule {}
