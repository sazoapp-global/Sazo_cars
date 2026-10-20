// Help: announcements from SAZO staff (A-06, Accounts plan 4.5) and help questions and answers (A-07, plan 2.3).
// Each is for everyone or for one group; people see what is for them. FAQ changes keep who, when, before and
// after; announcements can be withdrawn but are never edited.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { withTx } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import type { Actor } from '../iam/index.js';

export const AUDIENCES = ['everyone', 'buyers', 'garages', 'dealers', 'inspectors', 'partners', 'brokers', 'staff'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const FAQ_STATUSES = ['draft', 'published', 'hidden'] as const;

export class HelpError extends Error {
  constructor(readonly code: 'announcement_not_found' | 'faq_not_found' | 'already_withdrawn', message: string) {
    super(message);
  }
}

/** The groups a person belongs to, from their roles and the businesses they work for. */
export function audiencesOf(actor: Actor): Audience[] {
  const out = new Set<Audience>(['everyone', 'buyers']);
  for (const m of actor.memberships) {
    if (m.status !== 'active') continue;
    if (m.organisationType === 'garage') out.add('garages');
    else if (m.organisationType === 'dealer') out.add('dealers');
    else if (m.organisationType === 'inspector' || m.organisationType === 'inspection_centre') out.add('inspectors');
    else if (m.organisationType !== 'sazo') out.add('partners');
  }
  if (actor.platformRoles.includes('broker')) out.add('brokers');
  if (actor.platformRoles.some((r) => ['sazo_reviewer', 'sazo_admin', 'super_admin'].includes(r))) out.add('staff');
  return [...out];
}

export interface AnnouncementRow { id: string; audience: Audience; title: string; body: string; createdAt: Date; withdrawnAt: Date | null; read?: boolean }
export interface FaqRow { id: string; audience: Audience; topic: string; question: string; answer: string; status: (typeof FAQ_STATUSES)[number]; position: number; updatedAt: Date }

const FAQ_COLS = `id, audience, topic, question, answer, status, position, updated_at AS "updatedAt"`;

@Injectable()
export class HelpService {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  // Announcements -------------------------------------------------------------------------------------

  async announce(actor: Actor, a: { audience: Audience; title: string; body: string }): Promise<AnnouncementRow> {
    return (await this.pool.query<AnnouncementRow>(
      `INSERT INTO help.announcements (audience, title, body, created_by_user_id) VALUES ($1,$2,$3,$4)
       RETURNING id, audience, title, body, created_at AS "createdAt", withdrawn_at AS "withdrawnAt"`, [a.audience, a.title, a.body, actor.userId])).rows[0]!;
  }

  async withdraw(actor: Actor, id: string): Promise<void> {
    const r = await this.pool.query(`UPDATE help.announcements SET withdrawn_at = now(), withdrawn_by_user_id = $2 WHERE id = $1 AND withdrawn_at IS NULL`, [id, actor.userId]);
    if (r.rowCount === 1) return;
    const exists = await this.pool.query(`SELECT 1 FROM help.announcements WHERE id = $1`, [id]);
    throw exists.rowCount ? new HelpError('already_withdrawn', 'This announcement was already withdrawn') : new HelpError('announcement_not_found', 'No such announcement');
  }

  /** Staff view: every announcement, newest first, with how many people have read it. */
  async allAnnouncements(): Promise<(AnnouncementRow & { reads: number })[]> {
    return (await this.pool.query<AnnouncementRow & { reads: number }>(
      `SELECT a.id, a.audience, a.title, a.body, a.created_at AS "createdAt", a.withdrawn_at AS "withdrawnAt",
              (SELECT count(*)::int FROM help.announcement_reads r WHERE r.announcement_id = a.id) AS reads
         FROM help.announcements a ORDER BY a.created_at DESC LIMIT 200`)).rows;
  }

  /** The bell: live announcements for this person's groups, newest first, with whether they have read each. */
  async mine(actor: Actor): Promise<AnnouncementRow[]> {
    return (await this.pool.query<AnnouncementRow>(
      `SELECT a.id, a.audience, a.title, a.body, a.created_at AS "createdAt", a.withdrawn_at AS "withdrawnAt", (r.user_id IS NOT NULL) AS read
         FROM help.announcements a LEFT JOIN help.announcement_reads r ON r.announcement_id = a.id AND r.user_id = $2
        WHERE a.withdrawn_at IS NULL AND a.audience = ANY($1) ORDER BY a.created_at DESC LIMIT 50`, [audiencesOf(actor), actor.userId])).rows;
  }

  async markRead(actor: Actor, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.pool.query(
      `INSERT INTO help.announcement_reads (announcement_id, user_id)
       SELECT a.id, $2 FROM help.announcements a WHERE a.id = ANY($1) AND a.audience = ANY($3) ON CONFLICT DO NOTHING`, [ids, actor.userId, audiencesOf(actor)]);
  }

  // FAQs ---------------------------------------------------------------------------------------------

  /** What a person sees on the help page: published questions for their groups, by topic and position. */
  async faqsFor(audiences: Audience[]): Promise<FaqRow[]> {
    return (await this.pool.query<FaqRow>(
      `SELECT ${FAQ_COLS} FROM help.faqs WHERE status = 'published' AND audience = ANY($1) ORDER BY topic, position, question`, [audiences])).rows;
  }

  async allFaqs(): Promise<FaqRow[]> {
    return (await this.pool.query<FaqRow>(`SELECT ${FAQ_COLS} FROM help.faqs ORDER BY status, topic, position, question`)).rows;
  }

  async faqChanges(id: string) {
    return (await this.pool.query<{ changedBy: string; changedAt: Date; before: unknown; after: unknown }>(
      `SELECT changed_by_user_id AS "changedBy", changed_at AS "changedAt", before, after FROM help.faq_changes WHERE faq_id = $1 ORDER BY changed_at DESC`, [id])).rows;
  }

  async createFaq(actor: Actor, f: Omit<FaqRow, 'id' | 'updatedAt'>): Promise<FaqRow> {
    return withTx(this.pool, async (tx) => {
      const row = (await tx.query<FaqRow>(
        `INSERT INTO help.faqs (audience, topic, question, answer, status, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${FAQ_COLS}`,
        [f.audience, f.topic, f.question, f.answer, f.status, f.position])).rows[0]!;
      await tx.query(`INSERT INTO help.faq_changes (faq_id, changed_by_user_id, before, after) VALUES ($1,$2,NULL,$3)`, [row.id, actor.userId, JSON.stringify(snapshot(row))]);
      return row;
    });
  }

  /** Change any fields (including draft, published or hidden). The change is kept with before and after. */
  async updateFaq(actor: Actor, id: string, patch: Partial<Omit<FaqRow, 'id' | 'updatedAt'>>): Promise<FaqRow> {
    return withTx(this.pool, async (tx) => {
      const before = (await tx.query<FaqRow>(`SELECT ${FAQ_COLS} FROM help.faqs WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new HelpError('faq_not_found', 'No such question');
      const next = { ...snapshot(before), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
      const row = (await tx.query<FaqRow>(
        `UPDATE help.faqs SET audience = $2, topic = $3, question = $4, answer = $5, status = $6, position = $7 WHERE id = $1 RETURNING ${FAQ_COLS}`,
        [id, next.audience, next.topic, next.question, next.answer, next.status, next.position])).rows[0]!;
      await tx.query(`INSERT INTO help.faq_changes (faq_id, changed_by_user_id, before, after) VALUES ($1,$2,$3,$4)`,
        [id, actor.userId, JSON.stringify(snapshot(before)), JSON.stringify(snapshot(row))]);
      return row;
    });
  }
}

const snapshot = (f: FaqRow) => ({ audience: f.audience, topic: f.topic, question: f.question, answer: f.answer, status: f.status, position: f.position });
