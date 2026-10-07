// Transactional outbox + in-process dispatch (D-081 rule 2, API Outline §6).
//
// `bus.transaction(fn)` runs `fn` in a database transaction and gives it an `emit` function.
// Emitted events are written to the emitting module's outbox in the SAME transaction, so an event
// exists exactly when the change does. Only after COMMIT are that unit's events delivered to
// subscribers (never another request's), then marked published. A failed handler leaves the event
// unpublished with the error recorded so it can be retried (a background sweeper comes with BullMQ).
import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { DB_POOL } from './tokens.js';
import { withTx } from './sql.js';

export interface DomainEvent<P = Record<string, unknown>> {
  type: string;
  aggregateId: string;
  payload: P;
}
export type Emit = (schema: string, event: DomainEvent) => Promise<void>;
type Handler = (e: DomainEvent & { eventId: string }) => Promise<void>;

const MODULE_SCHEMAS = new Set(['iam', 'vehicle', 'ingest', 'obs', 'trust', 'report', 'garage', 'notify', 'ref', 'community']);

@Injectable()
export class EventBus {
  private readonly log = new Logger('EventBus');
  private readonly handlers = new Map<string, Handler[]>();

  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  subscribe(type: string, handler: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  async transaction<T>(fn: (tx: pg.PoolClient, emit: Emit) => Promise<T>): Promise<T> {
    const staged: { schema: string; id: string; event: DomainEvent }[] = [];
    const result = await withTx(this.pool, (tx) =>
      fn(tx, async (schema, event) => {
        if (!MODULE_SCHEMAS.has(schema)) throw new Error(`unknown module schema ${schema}`);
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO ${schema}.outbox (event_type, aggregate_id, payload) VALUES ($1, $2, $3) RETURNING id`,
          [event.type, event.aggregateId, event.payload],
        );
        staged.push({ schema, id: rows[0]!.id, event });
      }),
    );
    for (const s of staged) await this.deliver(s.schema, s.id, s.event);
    return result;
  }

  private async deliver(schema: string, id: string, event: DomainEvent): Promise<void> {
    try {
      for (const h of this.handlers.get(event.type) ?? []) await h({ ...event, eventId: id });
      await this.pool.query(`UPDATE ${schema}.outbox SET published_at = now(), attempts = attempts + 1 WHERE id = $1`, [id]);
    } catch (err) {
      this.log.error(`handler failed for ${event.type} ${id}: ${(err as Error).message}`);
      await this.pool.query(`UPDATE ${schema}.outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1`, [id, (err as Error).message]);
    }
  }
}
