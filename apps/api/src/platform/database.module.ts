import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { EventBus } from './event-bus.js';
import { DB, DB_POOL, type Db } from './tokens.js';

export { DB, DB_POOL, type Db };

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
    EventBus,
  ],
  exports: [DB_POOL, DB, EventBus],
})
export class DatabaseModule {}
