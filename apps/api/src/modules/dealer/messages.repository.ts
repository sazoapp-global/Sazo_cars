// Data access for messages in the dealer system (D-173). Owns dealer.conversations, dealer.messages and
// dealer.conversation_reads.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export type ConversationKind = 'team' | 'broker' | 'direct';
export interface ConversationRow { id: string; organisationId: string; kind: ConversationKind; brokerUserId: string | null; memberA: string | null; memberB: string | null; createdAt: Date; lastMessageAt: Date }
export interface ConversationSummary extends ConversationRow {
  lastBody: string | null; lastSenderId: string | null; lastStockId: string | null; lastAt: Date | null; unread: number;
}
export interface MessageRow { id: string; conversationId: string; senderUserId: string; body: string; stockItemId: string | null; createdAt: Date }
export interface ReadRow { userId: string; lastReadAt: Date }

const CONV = `c.id, c.organisation_id AS "organisationId", c.kind, c.broker_user_id AS "brokerUserId", c.member_a AS "memberA", c.member_b AS "memberB", c.created_at AS "createdAt", c.last_message_at AS "lastMessageAt"`;
const MSG = `id, conversation_id AS "conversationId", sender_user_id AS "senderUserId", body, stock_item_id AS "stockItemId", created_at AS "createdAt"`;
/** The latest message and the reader's unread count, for each conversation in a list. */
const SUMMARY = `${CONV}, m.body AS "lastBody", m.sender_user_id AS "lastSenderId", m.stock_item_id AS "lastStockId", m.created_at AS "lastAt",
  (SELECT count(*)::int FROM dealer.messages u WHERE u.conversation_id = c.id AND u.sender_user_id <> $2
     AND u.created_at > coalesce((SELECT r.last_read_at FROM dealer.conversation_reads r WHERE r.conversation_id = c.id AND r.user_id = $2), '-infinity')) AS unread
  FROM dealer.conversations c
  LEFT JOIN LATERAL (SELECT body, sender_user_id, stock_item_id, created_at FROM dealer.messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) m ON true`;

@Injectable()
export class MessagesRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async conversation(id: string): Promise<ConversationRow | undefined> {
    return (await this.pool.query<ConversationRow>(`SELECT ${CONV} FROM dealer.conversations c WHERE c.id = $1`, [id])).rows[0];
  }

  /** The dealer team's conversation, made the first time it is needed. */
  async teamConversation(organisationId: string, sql: Sql = this.pool): Promise<ConversationRow> {
    await sql.query(`INSERT INTO dealer.conversations (organisation_id, kind) VALUES ($1, 'team') ON CONFLICT (organisation_id) WHERE kind = 'team' DO NOTHING`, [organisationId]);
    return (await sql.query<ConversationRow>(`SELECT ${CONV} FROM dealer.conversations c WHERE c.organisation_id = $1 AND c.kind = 'team'`, [organisationId])).rows[0]!;
  }

  async brokerConversation(organisationId: string, brokerUserId: string): Promise<ConversationRow | undefined> {
    return (await this.pool.query<ConversationRow>(
      `SELECT ${CONV} FROM dealer.conversations c WHERE c.organisation_id = $1 AND c.kind = 'broker' AND c.broker_user_id = $2`, [organisationId, brokerUserId])).rows[0];
  }

  /** A dealer and a broker's conversation, made when the first message is sent. */
  async openBrokerConversation(organisationId: string, brokerUserId: string, sql: Sql = this.pool): Promise<ConversationRow> {
    await sql.query(
      `INSERT INTO dealer.conversations (organisation_id, kind, broker_user_id) VALUES ($1, 'broker', $2)
       ON CONFLICT (organisation_id, broker_user_id) WHERE kind = 'broker' DO NOTHING`, [organisationId, brokerUserId]);
    return (await sql.query<ConversationRow>(
      `SELECT ${CONV} FROM dealer.conversations c WHERE c.organisation_id = $1 AND c.kind = 'broker' AND c.broker_user_id = $2`, [organisationId, brokerUserId])).rows[0]!;
  }

  /** Two team members' private chat (D-177), made the first time either opens it. */
  async openDirect(organisationId: string, one: string, other: string): Promise<ConversationRow> {
    const [a, b] = [one, other].sort();
    await this.pool.query(
      `INSERT INTO dealer.conversations (organisation_id, kind, member_a, member_b) VALUES ($1, 'direct', $2, $3)
       ON CONFLICT (organisation_id, member_a, member_b) WHERE kind = 'direct' DO NOTHING`, [organisationId, a, b]);
    return (await this.pool.query<ConversationRow>(
      `SELECT ${CONV} FROM dealer.conversations c WHERE c.organisation_id = $1 AND c.kind = 'direct' AND c.member_a = $2 AND c.member_b = $3`, [organisationId, a, b])).rows[0]!;
  }

  /** A dealer's conversations, newest first, as one member of its team sees them: private chats only their own. */
  async forDealer(organisationId: string, readerId: string): Promise<ConversationSummary[]> {
    return (await this.pool.query<ConversationSummary>(
      `SELECT ${SUMMARY} WHERE c.organisation_id = $1 AND (c.kind <> 'direct' OR $2 IN (c.member_a, c.member_b)) ORDER BY c.last_message_at DESC`, [organisationId, readerId])).rows;
  }

  /** A broker's conversations with dealers, newest first. */
  async forBroker(brokerUserId: string): Promise<ConversationSummary[]> {
    return (await this.pool.query<ConversationSummary>(
      `SELECT ${SUMMARY} WHERE c.kind = 'broker' AND c.broker_user_id = $1 ORDER BY c.last_message_at DESC`, [brokerUserId, brokerUserId])).rows;
  }

  /** The latest messages of a conversation, oldest first. */
  async messages(conversationId: string, limit = 200): Promise<MessageRow[]> {
    return (await this.pool.query<MessageRow>(
      `SELECT * FROM (SELECT ${MSG} FROM dealer.messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2) t ORDER BY "createdAt"`, [conversationId, limit])).rows;
  }

  async add(sql: Sql, m: { conversationId: string; senderUserId: string; body: string; stockItemId: string | null }): Promise<MessageRow> {
    const row = (await sql.query<MessageRow>(
      `INSERT INTO dealer.messages (conversation_id, sender_user_id, body, stock_item_id) VALUES ($1,$2,$3,$4) RETURNING ${MSG}`,
      [m.conversationId, m.senderUserId, m.body, m.stockItemId])).rows[0]!;
    await sql.query(`UPDATE dealer.conversations SET last_message_at = $2 WHERE id = $1`, [m.conversationId, row.createdAt]);
    // Writing a message means the sender has read everything before it.
    await this.markRead(m.conversationId, m.senderUserId, row.createdAt, sql);
    return row;
  }

  async markRead(conversationId: string, userId: string, at: Date = new Date(), sql: Sql = this.pool): Promise<void> {
    await sql.query(
      `INSERT INTO dealer.conversation_reads (conversation_id, user_id, last_read_at) VALUES ($1,$2,$3)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = greatest(dealer.conversation_reads.last_read_at, EXCLUDED.last_read_at)`,
      [conversationId, userId, at]);
  }

  /** Dealers with at least one car open to brokers (the service keeps only approved dealers). */
  async dealersWithCarsOpenToBrokers(): Promise<string[]> {
    return (await this.pool.query<{ id: string }>(
      `SELECT DISTINCT organisation_id AS id FROM dealer.stock_items
        WHERE status = 'in_stock' AND open_to_brokers AND commission_kind IS NOT NULL AND vehicle_id IS NOT NULL`)).rows.map((r) => r.id);
  }

  async reads(conversationId: string): Promise<ReadRow[]> {
    return (await this.pool.query<ReadRow>(
      `SELECT user_id AS "userId", last_read_at AS "lastReadAt" FROM dealer.conversation_reads WHERE conversation_id = $1`, [conversationId])).rows;
  }
}
