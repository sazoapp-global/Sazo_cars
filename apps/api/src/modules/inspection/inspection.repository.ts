// Data access for the Inspector workspace. Owns the `inspection` schema.
import { Inject, Injectable } from '@nestjs/common';
import type { InspectionForm } from '@sazo/contracts';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';

export type InspectionStatus = 'draft' | 'submitted' | 'accepted' | 'rejected';

export interface InspectionRow {
  id: string; publicRef: string; organisationId: string; createdBy: string; plateEntered: string; vehicleId: string | null;
  form: InspectionForm; status: InspectionStatus; clientCreatedAt: string; submittedAt: string | null; submissionId: string | null;
  reportEvidenceId: string | null; rejectionReason: string | null; version: number; acknowledgedWarnings: { code: string; explanation: string }[];
  submitKey: string | null;
}

const COLS = `id, public_ref AS "publicRef", organisation_id AS "organisationId", created_by_user_id AS "createdBy",
  plate_entered AS "plateEntered", vehicle_id AS "vehicleId", form, status, client_created_at AS "clientCreatedAt",
  submitted_at AS "submittedAt", submission_id AS "submissionId", report_evidence_id AS "reportEvidenceId",
  rejection_reason AS "rejectionReason", version, acknowledged_warnings AS "acknowledgedWarnings", submit_idempotency_key AS "submitKey"`;

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const fix = (r: InspectionRow): InspectionRow => ({ ...r, clientCreatedAt: iso(r.clientCreatedAt)!, submittedAt: iso(r.submittedAt) });

@Injectable()
export class InspectionRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async get(id: string): Promise<InspectionRow | undefined> {
    const { rows } = await this.pool.query<InspectionRow>(`SELECT ${COLS} FROM inspection.inspections WHERE id = $1`, [id]);
    return rows[0] && fix(rows[0]);
  }

  async list(organisationId: string, status: InspectionStatus | undefined, limit: number): Promise<InspectionRow[]> {
    const { rows } = await this.pool.query<InspectionRow>(
      `SELECT ${COLS} FROM inspection.inspections WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC, id LIMIT $3`, [organisationId, status ?? null, limit]);
    return rows.map(fix);
  }

  /** Insert a new draft. Returns false if the id already exists (two devices saving the same new id at once). */
  async insert(r: { id: string; organisationId: string; createdBy: string; plateEntered: string; vehicleId: string | null; form: object; clientCreatedAt: string }): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO inspection.inspections (id, public_ref, organisation_id, created_by_user_id, plate_entered, vehicle_id, form, client_created_at)
       VALUES ($1, 'IN-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('inspection.ref_seq')::text, 5, '0'), $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.organisationId, r.createdBy, r.plateEntered, r.vehicleId, JSON.stringify(r.form), r.clientCreatedAt]);
    return res.rowCount === 1;
  }

  /** Optimistic update of a draft (at the expected version when one is given). False on a lost race. */
  async update(r: { id: string; plateEntered: string; vehicleId: string | null; form: object; clientCreatedAt: string; expectedVersion?: number }): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE inspection.inspections SET plate_entered = $2, vehicle_id = $3, form = $4, client_created_at = $5, version = version + 1
        WHERE id = $1 AND status = 'draft' AND ($6::int IS NULL OR version = $6)`,
      [r.id, r.plateEntered, r.vehicleId, JSON.stringify(r.form), r.clientCreatedAt, r.expectedVersion ?? null]);
    return res.rowCount === 1;
  }

  async claimForSubmit(id: string, key: string, acknowledged: object[]): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE inspection.inspections SET status = 'submitted', submitted_at = now(), submit_idempotency_key = $2, acknowledged_warnings = $3, version = version + 1
        WHERE id = $1 AND status = 'draft'`, [id, key, JSON.stringify(acknowledged)]);
    return res.rowCount === 1;
  }

  async releaseClaim(id: string): Promise<void> {
    await this.pool.query(`UPDATE inspection.inspections SET status = 'draft', submitted_at = NULL, submit_idempotency_key = NULL WHERE id = $1 AND submission_id IS NULL`, [id]);
  }

  async recordOutcome(id: string, o: { submissionId: string; status: InspectionStatus; vehicleId: string | null; reportEvidenceId: string; rejectionReason: string | null }): Promise<void> {
    await this.pool.query(
      `UPDATE inspection.inspections SET submission_id = $2, status = $3, vehicle_id = COALESCE($4, vehicle_id), report_evidence_id = $5, rejection_reason = $6 WHERE id = $1`,
      [id, o.submissionId, o.status, o.vehicleId, o.reportEvidenceId, o.rejectionReason]);
  }
}
