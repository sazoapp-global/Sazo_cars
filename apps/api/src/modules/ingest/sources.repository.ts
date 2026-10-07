import { Inject, Injectable } from '@nestjs/common';
import type { EvidenceClass, SourceDomain } from '@sazo/contracts';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';

export interface SourceRow {
  id: string;
  code: string;
  name: string;
  organisationId: string;
  domain: SourceDomain;
  channel: string;
  isSimulated: boolean;
  evidenceClass: EvidenceClass;
  baselineReputation: number;
  status: 'active' | 'paused' | 'retired';
  supersededBySourceId: string | null;
  coverage: { scope: string; from: string; to?: string }[];
}

@Injectable()
export class SourcesRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async list(): Promise<SourceRow[]> {
    const { rows } = await this.pool.query<SourceRow>(
      `SELECT s.id, s.code, s.name, s.organisation_id AS "organisationId", s.domain, s.channel, s.is_simulated AS "isSimulated",
              s.default_evidence_class AS "evidenceClass", s.baseline_reputation::float AS "baselineReputation", s.status,
              s.superseded_by_source_id AS "supersededBySourceId",
              COALESCE(json_agg(json_build_object('scope', c.scope, 'from', c.period_from, 'to', c.period_to))
                       FILTER (WHERE c.id IS NOT NULL), '[]') AS coverage
         FROM ingest.sources s LEFT JOIN ingest.source_coverages c ON c.source_id = s.id
        GROUP BY s.id ORDER BY s.code`,
    );
    return rows.map((r) => ({ ...r, coverage: r.coverage.map((c) => ({ scope: c.scope, from: c.from, ...(c.to ? { to: c.to } : {}) })) }));
  }

  async byCode(code: string): Promise<SourceRow | undefined> {
    return (await this.list()).find((s) => s.code === code);
  }

  async byId(id: string): Promise<SourceRow | undefined> {
    return (await this.list()).find((s) => s.id === id);
  }

  /** Pause, retire or supersede a source (D-011, X1). Its records stay; Trust decides how to weigh them. */
  async updateStatus(sql: Sql, id: string, change: { status?: SourceRow['status']; supersededBySourceId?: string | null }): Promise<void> {
    await sql.query(
      `UPDATE ingest.sources
          SET status = COALESCE($2, status),
              superseded_by_source_id = CASE WHEN $3::boolean THEN $4::uuid ELSE superseded_by_source_id END,
              active_to = CASE WHEN COALESCE($2, status) = 'retired' THEN COALESCE(active_to, now())
                               WHEN COALESCE($2, status) = 'active' THEN NULL ELSE active_to END
        WHERE id = $1`,
      [id, change.status ?? null, change.supersededBySourceId !== undefined, change.supersededBySourceId ?? null],
    );
  }

  /** Create or update a source (used by seeding and the admin console). */
  async upsert(s: {
    code: string; name: string; organisationId: string; domain: SourceDomain; channel: string; isSimulated: boolean;
    evidenceClass: EvidenceClass; baselineReputation: number; coverage: { scope: string; from: string }[];
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO ingest.sources (code, name, organisation_id, domain, channel, is_simulated, default_evidence_class, baseline_reputation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [s.code, s.name, s.organisationId, s.domain, s.channel, s.isSimulated, s.evidenceClass, s.baselineReputation],
    );
    const id = rows[0]!.id;
    await this.pool.query('DELETE FROM ingest.source_coverages WHERE source_id = $1', [id]);
    for (const c of s.coverage) {
      await this.pool.query('INSERT INTO ingest.source_coverages (source_id, domain, scope, period_from) VALUES ($1,$2,$3,$4)', [id, s.domain, c.scope, c.from]);
    }
    return id;
  }
}
