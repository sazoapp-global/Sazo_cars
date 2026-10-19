// Data access for dealership selling (D-125 step 2): car links, enquiries (leads) and their history.
// Owns dealer.car_links, dealer.leads and dealer.lead_events.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export const LINK_CHANNELS = ['whatsapp', 'tiktok', 'facebook', 'instagram', 'other'] as const;
export type LinkChannel = (typeof LINK_CHANNELS)[number];
export const LEAD_SOURCES = ['whatsapp', 'tiktok', 'facebook', 'instagram', 'broker', 'walk_in', 'phone_call', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_STAGES = ['enquiry', 'viewing', 'negotiation', 'deposit', 'handover', 'completed', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const OPEN_STAGES: LeadStage[] = ['enquiry', 'viewing', 'negotiation', 'deposit', 'handover'];

export interface LinkRow {
  id: string; organisationId: string; stockItemId: string; channel: LinkChannel; brokerUserId: string | null; showDealerName: boolean;
  createdBy: string; createdAt: Date; revokedAt: Date | null;
}
export interface LeadRow {
  id: string; organisationId: string; stockItemId: string | null; partyId: string; source: LeadSource; carLinkId: string | null; brokerUserId: string | null;
  stage: LeadStage; consentToContact: boolean; message: string | null; salePriceUgx: number | null; createdBy: string | null; createdAt: Date; updatedAt: Date; closedAt: Date | null;
}
export interface LeadEventRow { kind: 'created' | 'stage' | 'note'; fromStage: string | null; toStage: string | null; note: string | null; actorUserId: string | null; at: Date }

const LINK_COLS = `id, organisation_id AS "organisationId", stock_item_id AS "stockItemId", channel, broker_user_id AS "brokerUserId",
  show_dealer_name AS "showDealerName", created_by_user_id AS "createdBy", created_at AS "createdAt", revoked_at AS "revokedAt"`;
const LEAD_COLS = `id, organisation_id AS "organisationId", stock_item_id AS "stockItemId", party_id AS "partyId", source, car_link_id AS "carLinkId",
  broker_user_id AS "brokerUserId", stage, consent_to_contact AS "consentToContact", message, sale_price_ugx::float8 AS "salePriceUgx",
  created_by_user_id AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt", closed_at AS "closedAt"`;

@Injectable()
export class SellingRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  // Links -------------------------------------------------------------------------------------------------

  async createLink(sql: Sql, l: { organisationId: string; stockItemId: string; channel: LinkChannel; brokerUserId: string | null; showDealerName: boolean; createdBy: string; tokenHash: Buffer }): Promise<LinkRow> {
    return (await sql.query<LinkRow>(
      `INSERT INTO dealer.car_links (token_hash, organisation_id, stock_item_id, channel, broker_user_id, show_dealer_name, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${LINK_COLS}`,
      [l.tokenHash, l.organisationId, l.stockItemId, l.channel, l.brokerUserId, l.showDealerName, l.createdBy])).rows[0]!;
  }

  async linkByHash(hash: Buffer): Promise<LinkRow | undefined> {
    return (await this.pool.query<LinkRow>(`SELECT ${LINK_COLS} FROM dealer.car_links WHERE token_hash = $1`, [hash])).rows[0];
  }

  async link(id: string): Promise<LinkRow | undefined> {
    return (await this.pool.query<LinkRow>(`SELECT ${LINK_COLS} FROM dealer.car_links WHERE id = $1`, [id])).rows[0];
  }

  /** The dealer's own links for a car (not brokers' links). */
  async dealerLinks(stockItemId: string): Promise<LinkRow[]> {
    return (await this.pool.query<LinkRow>(
      `SELECT ${LINK_COLS} FROM dealer.car_links WHERE stock_item_id = $1 AND broker_user_id IS NULL AND revoked_at IS NULL ORDER BY created_at DESC`, [stockItemId])).rows;
  }

  async revokeLink(id: string): Promise<boolean> {
    return (await this.pool.query(`UPDATE dealer.car_links SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id])).rowCount === 1;
  }

  // Leads -------------------------------------------------------------------------------------------------

  async lead(id: string, sql: Sql = this.pool): Promise<LeadRow | undefined> {
    return (await sql.query<LeadRow>(`SELECT ${LEAD_COLS} FROM dealer.leads WHERE id = $1`, [id])).rows[0];
  }

  async leads(organisationId: string, stages: LeadStage[] | undefined): Promise<LeadRow[]> {
    return (await this.pool.query<LeadRow>(
      `SELECT ${LEAD_COLS} FROM dealer.leads WHERE organisation_id = $1 AND ($2::text[] IS NULL OR stage = ANY($2))
        ORDER BY (stage IN ('completed','lost')), updated_at DESC LIMIT 300`, [organisationId, stages ?? null])).rows;
  }

  /** An open enquiry this dealer already has from the same phone about the same car. */
  async openLeadFor(sql: Sql, organisationId: string, phoneHash: Buffer, stockItemId: string | null): Promise<LeadRow | undefined> {
    return (await sql.query<LeadRow>(
      `SELECT ${LEAD_COLS} FROM dealer.leads WHERE organisation_id = $1 AND phone_hash = $2 AND stock_item_id IS NOT DISTINCT FROM $3
          AND stage NOT IN ('completed','lost') ORDER BY created_at LIMIT 1`, [organisationId, phoneHash, stockItemId])).rows[0];
  }

  async insertLead(sql: Sql, l: { organisationId: string; stockItemId: string | null; partyId: string; phoneHash: Buffer; source: LeadSource; carLinkId: string | null;
    brokerUserId: string | null; consentToContact: boolean; message: string | null; createdBy: string | null }): Promise<LeadRow> {
    const row = (await sql.query<LeadRow>(
      `INSERT INTO dealer.leads (organisation_id, stock_item_id, party_id, phone_hash, source, car_link_id, broker_user_id, consent_to_contact, message, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${LEAD_COLS}`,
      [l.organisationId, l.stockItemId, l.partyId, l.phoneHash, l.source, l.carLinkId, l.brokerUserId, l.consentToContact, l.message, l.createdBy])).rows[0]!;
    await this.event(sql, { organisationId: l.organisationId, leadId: row.id, kind: 'created', toStage: 'enquiry', note: null, actorUserId: l.createdBy });
    return row;
  }

  /** Move an enquiry only if it is still at `from` (two people moving it at once cannot both win). */
  async setStage(sql: Sql, id: string, from: LeadStage, to: LeadStage, salePriceUgx: number | null): Promise<boolean> {
    const closed = to === 'completed' || to === 'lost';
    return (await sql.query(
      `UPDATE dealer.leads SET stage = $3, sale_price_ugx = COALESCE($4, sale_price_ugx), closed_at = CASE WHEN $5 THEN now() ELSE NULL END
        WHERE id = $1 AND stage = $2`, [id, from, to, salePriceUgx, closed])).rowCount === 1;
  }

  async event(sql: Sql, e: { organisationId: string; leadId: string; kind: 'created' | 'stage' | 'note'; fromStage?: string | null; toStage?: string | null; note: string | null; actorUserId: string | null }) {
    await sql.query(
      `INSERT INTO dealer.lead_events (organisation_id, lead_id, kind, from_stage, to_stage, note, actor_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.organisationId, e.leadId, e.kind, e.fromStage ?? null, e.toStage ?? null, e.note, e.actorUserId]);
    await sql.query(`UPDATE dealer.leads SET updated_at = now() WHERE id = $1`, [e.leadId]);
  }

  async events(leadId: string): Promise<LeadEventRow[]> {
    return (await this.pool.query<LeadEventRow>(
      `SELECT kind, from_stage AS "fromStage", to_stage AS "toStage", note, actor_user_id AS "actorUserId", at FROM dealer.lead_events WHERE lead_id = $1 ORDER BY at, id`, [leadId])).rows;
  }

  /** Enquiries and completed sales by where they came from, since a date (the owner's "which channel sells" view). */
  async bySource(organisationId: string, since: string): Promise<{ source: LeadSource; enquiries: number; completed: number }[]> {
    return (await this.pool.query<{ source: LeadSource; enquiries: number; completed: number }>(
      `SELECT source, count(*)::int AS enquiries, count(*) FILTER (WHERE stage = 'completed')::int AS completed
         FROM dealer.leads WHERE organisation_id = $1 AND created_at >= $2::date GROUP BY source ORDER BY completed DESC, enquiries DESC`, [organisationId, since])).rows;
  }
}
