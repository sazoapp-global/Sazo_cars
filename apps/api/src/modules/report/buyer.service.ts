// What buyers keep and share (API Outline §5.4): saved checks, comparisons and frozen report links.
// A shared link opens a snapshot frozen at the moment it was made — later records don't change it.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';
import { TrustService } from '../trust/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { ReportNotFound, ReportsService } from './reports.service.js';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const code4 = () => Array.from({ length: 4 }, () => CROCKFORD[randomInt(CROCKFORD.length)]).join('');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const SHARE_DAYS_DEFAULT = 30;

export class BuyerError extends Error {
  constructor(readonly code: 'too_many' | 'not_found' | 'link_expired', message: string) { super(message); }
}

type FullReport = Awaited<ReturnType<ReportsService['fullReport']>>;

@Injectable()
export class BuyerService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(TrustService) private readonly trust: TrustService,
  ) {}

  private async vehicleId(ref: string): Promise<string> {
    const id = await this.registry.idForRef(ref);
    if (!id) throw new ReportNotFound(ref);
    return id;
  }

  // ---------- saved checks
  async save(userId: string, ref: string): Promise<void> {
    const id = await this.vehicleId(ref);
    const { rows } = await this.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM report.saved_checks WHERE user_id = $1', [userId]);
    if (rows[0]!.n >= 200) throw new BuyerError('too_many', 'You can save up to 200 cars');
    await this.pool.query('INSERT INTO report.saved_checks (user_id, vehicle_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, id]);
  }

  async unsave(userId: string, ref: string): Promise<void> {
    const id = await this.registry.idForRef(ref);
    if (id) await this.pool.query('DELETE FROM report.saved_checks WHERE user_id = $1 AND vehicle_id = $2', [userId, id]);
  }

  async isSaved(userId: string, ref: string): Promise<boolean> {
    const id = await this.registry.idForRef(ref);
    if (!id) return false;
    const { rows } = await this.pool.query('SELECT 1 FROM report.saved_checks WHERE user_id = $1 AND vehicle_id = $2', [userId, id]);
    return rows.length > 0;
  }

  /** Saved cars with today's summary (statuses can change as new records arrive). */
  async saved(userId: string) {
    const { rows } = await this.pool.query<{ vehicle_id: string; created_at: Date }>(
      'SELECT vehicle_id, created_at FROM report.saved_checks WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    const out = [];
    for (const r of rows) {
      const v = await this.registry.getVehicle(r.vehicle_id);
      if (!v) continue;
      const summary = await this.reports.publicSummary(v.publicRef).catch(() => undefined);
      if (summary) out.push({ vehicleRef: summary.vehicle.vehicleRef, savedAt: r.created_at.toISOString(), summary });
    }
    return out;
  }

  // ---------- compare (D-042)
  async compare(refs: string[]) {
    const vehicles: FullReport[] = [];
    for (const ref of refs) vehicles.push(await this.reports.fullReport(ref));
    const order = vehicles[0]?.questions.map((q) => q.question) ?? [];
    const differingQuestions = order.filter((q) => new Set(vehicles.map((v) => v.questions.find((x) => x.question === q)?.status)).size > 1);
    return { vehicles, differingQuestions };
  }

  // ---------- frozen snapshots + share links
  async snapshot(userId: string, ref: string, opts: { share: boolean; expiresInDays: number }) {
    const report = await this.reports.fullReport(ref);
    const vehicleId = await this.vehicleId(ref);
    const runId = (await this.trust.current(vehicleId))!.runId;
    for (let attempt = 0; attempt < 5; attempt++) {
      const snapshotRef = `SZR-${code4()}-${code4()}`;
      try {
        const { rows } = await this.pool.query<{ id: string; created_at: Date }>(
          `INSERT INTO report.report_snapshots (public_ref, vehicle_id, audience, trust_run_id, content, created_by_user_id)
           VALUES ($1,$2,'consumer',$3,$4,$5) RETURNING id, created_at`,
          [snapshotRef, vehicleId, runId, JSON.stringify(report), userId]);
        let token: string | undefined;
        let expiresAt: string | null = null;
        if (opts.share) {
          token = randomBytes(18).toString('base64url');
          const ins = await this.pool.query<{ expires_at: Date }>(
            `INSERT INTO report.shared_links (token_hash, snapshot_id, created_by_user_id, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4)) RETURNING expires_at`,
            [hash(token), rows[0]!.id, userId, opts.expiresInDays]);
          expiresAt = ins.rows[0]!.expires_at.toISOString();
        }
        return { snapshotRef, vehicleRef: report.vehicle.vehicleRef, createdAt: rows[0]!.created_at.toISOString(), token, expiresAt, report };
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err; // reference collision: try another
      }
    }
    throw new Error('could not allocate a snapshot reference');
  }

  /** Opened from a shared link: no sign-in, frozen content. */
  async openShared(token: string) {
    const { rows } = await this.pool.query<{ public_ref: string; content: FullReport; created_at: Date; expires_at: Date | null; revoked_at: Date | null }>(
      `SELECT s.public_ref, s.content, s.created_at, l.expires_at, l.revoked_at
         FROM report.shared_links l JOIN report.report_snapshots s ON s.id = l.snapshot_id WHERE l.token_hash = $1`, [hash(token)]);
    const r = rows[0];
    if (!r || r.revoked_at) throw new BuyerError('not_found', 'This link is not valid');
    if (r.expires_at && r.expires_at.getTime() < Date.now()) throw new BuyerError('link_expired', 'This link has expired');
    return { snapshotRef: r.public_ref, vehicleRef: r.content.vehicle.vehicleRef, createdAt: r.created_at.toISOString(), expiresAt: r.expires_at?.toISOString() ?? null, report: r.content };
  }

  async myShares(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT l.id, s.public_ref AS "snapshotRef", s.content->'vehicle'->>'vehicleRef' AS "vehicleRef", s.content->'vehicle'->>'currentPlate' AS plate,
              l.created_at AS "createdAt", l.expires_at AS "expiresAt", l.revoked_at IS NOT NULL AS revoked
         FROM report.shared_links l JOIN report.report_snapshots s ON s.id = l.snapshot_id
        WHERE l.created_by_user_id = $1 ORDER BY l.created_at DESC LIMIT 100`, [userId]);
    return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null }));
  }

  async revokeShare(userId: string, linkId: string): Promise<boolean> {
    const r = await this.pool.query('UPDATE report.shared_links SET revoked_at = now() WHERE id = $1 AND created_by_user_id = $2 AND revoked_at IS NULL', [linkId, userId]);
    return r.rowCount === 1;
  }
}
