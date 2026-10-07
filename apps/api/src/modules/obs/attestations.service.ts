// Owner confirmation (D-058, Rule Set §2): a single-use link sent by SMS asks the customer to confirm or
// dispute a recorded visit. Only a hash of the token is stored. Answers feed garage reputation via Trust.
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { EventBus } from '../../platform/event-bus.js';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export const ATTESTATION_TTL_DAYS = 14;
const hash = (token: string) => createHash('sha256').update(token).digest();

export class AttestationError extends Error {
  constructor(readonly code: 'not_found' | 'expired' | 'already_answered', message: string) {
    super(message);
  }
}

export interface AttestationRequestInfo {
  requestId: string; eventId: string; partyId: string; expiresAt: string;
  answer: 'confirmed' | 'disputed' | null;
}

@Injectable()
export class AttestationsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  /** The visit (event) an observation belongs to. */
  async eventOf(observationId: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ event_id: string | null }>('SELECT event_id FROM obs.observations WHERE id = $1', [observationId]);
    return rows[0]?.event_id ?? undefined;
  }

  /** Create a request and return the raw token (put it in the SMS link; it is not stored). */
  async createRequest(r: { eventId: string; partyId: string; channel: 'sms_link' | 'sms_reply' }, sql: Sql = this.pool): Promise<{ requestId: string; token: string; expiresAt: string }> {
    const token = randomBytes(18).toString('base64url'); // 24 chars, 144 bits
    const { rows } = await sql.query<{ id: string; expires_at: Date }>(
      `INSERT INTO obs.attestation_requests (target_event_id, party_id, channel, token_hash, expires_at)
       VALUES ($1,$2,$3,$4, now() + make_interval(days => $5)) RETURNING id, expires_at`,
      [r.eventId, r.partyId, r.channel, hash(token), ATTESTATION_TTL_DAYS],
    );
    return { requestId: rows[0]!.id, token, expiresAt: rows[0]!.expires_at.toISOString() };
  }

  private async info(where: string, value: unknown): Promise<AttestationRequestInfo | undefined> {
    const { rows } = await this.pool.query(
      `SELECT r.id AS "requestId", r.target_event_id AS "eventId", r.party_id AS "partyId", r.expires_at AS "expiresAt",
              (SELECT a.response FROM obs.attestations a WHERE a.request_id = r.id) AS answer
         FROM obs.attestation_requests r WHERE ${where} = $1`, [value]);
    const r = rows[0];
    return r ? { ...r, expiresAt: new Date(r.expiresAt).toISOString() } : undefined;
  }

  byToken(token: string): Promise<AttestationRequestInfo | undefined> {
    return this.info('r.token_hash', hash(token));
  }

  byId(requestId: string): Promise<AttestationRequestInfo | undefined> {
    return this.info('r.id', requestId);
  }

  /** Record the answer once; Trust recomputes the vehicle (and the garage's reputation) on attestation.received. */
  async answer(token: string, response: 'confirmed' | 'disputed', comment?: string): Promise<AttestationRequestInfo> {
    const req = await this.byToken(token);
    if (!req) throw new AttestationError('not_found', 'This link is not valid');
    if (req.answer) throw new AttestationError('already_answered', 'You have already answered');
    if (new Date(req.expiresAt).getTime() < Date.now()) throw new AttestationError('expired', 'This link has expired');
    await this.bus.transaction(async (tx, emit) => {
      const { rows } = await tx.query<{ vehicle_id: string; source_id: string }>('SELECT vehicle_id, source_id FROM obs.vehicle_events WHERE id = $1', [req.eventId]);
      await tx.query(
        `INSERT INTO obs.attestations (request_id, target_event_id, attester_kind, attester_party_id, channel, response, comment)
         VALUES ($1,$2,'customer',$3,'sms_link',$4,$5)`,
        [req.requestId, req.eventId, req.partyId, response, comment ?? null]);
      await emit('obs', { type: 'attestation.received', aggregateId: rows[0]!.vehicle_id, payload: { vehicleId: rows[0]!.vehicle_id, sourceId: rows[0]!.source_id, response } });
    }).catch((err: { code?: string }) => {
      // Two taps at once: the unique index lets only one answer in.
      if (err.code === '23505') throw new AttestationError('already_answered', 'You have already answered');
      throw err;
    });
    return { ...req, answer: response };
  }
}
