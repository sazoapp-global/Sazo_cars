// Data access for the Garage workspace. Owns the `garage` schema.
import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import type { Sql } from '../../platform/sql.js';
import { DB_POOL } from '../../platform/tokens.js';
import type { JobForm, WorkType } from './job-form.js';

export type JobStatus = 'draft' | 'submitted' | 'accepted' | 'rejected';

export interface JobRow {
  id: string; publicRef: string; organisationId: string; createdBy: string; plateEntered: string; vehicleId: string | null;
  workTypes: WorkType[]; form: JobForm; status: JobStatus; clientCreatedAt: string; submittedAt: string | null; submissionId: string | null;
  rejectionReason: string | null; version: number; acknowledgedWarnings: { code: string; explanation: string }[];
  submitKey: string | null; partyId: string | null; phoneProvided: boolean; smsConsent: boolean; attestationRequestId: string | null;
}

const COLS = `j.id, j.public_ref AS "publicRef", j.organisation_id AS "organisationId", j.created_by_user_id AS "createdBy",
  j.plate_entered AS "plateEntered", j.vehicle_id AS "vehicleId", j.work_types AS "workTypes", j.form, j.status,
  j.client_created_at AS "clientCreatedAt", j.submitted_at AS "submittedAt", j.submission_id AS "submissionId",
  j.rejection_reason AS "rejectionReason", j.version, j.acknowledged_warnings AS "acknowledgedWarnings",
  j.submit_idempotency_key AS "submitKey", c.party_id AS "partyId", COALESCE(c.phone_provided, false) AS "phoneProvided",
  COALESCE(c.sms_consent, false) AS "smsConsent", c.attestation_request_id AS "attestationRequestId"`;

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const fix = (r: JobRow): JobRow => ({ ...r, clientCreatedAt: iso(r.clientCreatedAt)!, submittedAt: iso(r.submittedAt) });

@Injectable()
export class GarageRepository {
  constructor(@Inject(DB_POOL) private readonly pool: pg.Pool) {}

  async job(id: string, sql: Sql = this.pool): Promise<JobRow | undefined> {
    const { rows } = await sql.query<JobRow>(`SELECT ${COLS} FROM garage.jobs j LEFT JOIN garage.job_customers c ON c.job_id = j.id WHERE j.id = $1`, [id]);
    return rows[0] && fix(rows[0]);
  }

  async list(organisationId: string, status: JobStatus | undefined, limit: number): Promise<JobRow[]> {
    const { rows } = await this.pool.query<JobRow>(
      `SELECT ${COLS} FROM garage.jobs j LEFT JOIN garage.job_customers c ON c.job_id = j.id
        WHERE j.organisation_id = $1 AND ($2::text IS NULL OR j.status = $2) ORDER BY j.created_at DESC, j.id LIMIT $3`,
      [organisationId, status ?? null, limit]);
    return rows.map(fix);
  }

  async insertDraft(sql: Sql, j: { id: string; organisationId: string; createdBy: string; plateEntered: string; vehicleId: string | null; workTypes: string[]; form: object; clientCreatedAt: string }): Promise<void> {
    await sql.query(
      `INSERT INTO garage.jobs (id, public_ref, organisation_id, created_by_user_id, plate_entered, vehicle_id, work_types, form, client_created_at)
       VALUES ($1, 'GJ-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('garage.job_ref_seq')::text, 5, '0'), $2, $3, $4, $5, $6, $7, $8)`,
      [j.id, j.organisationId, j.createdBy, j.plateEntered, j.vehicleId, j.workTypes, JSON.stringify(j.form), j.clientCreatedAt]);
  }

  /** Optimistic update: only a draft, and only at the expected version (when one is given). Returns false on a lost race. */
  async updateDraft(sql: Sql, j: { id: string; plateEntered: string; vehicleId: string | null; workTypes: string[]; form: object; clientCreatedAt: string; expectedVersion?: number }): Promise<boolean> {
    const r = await sql.query(
      `UPDATE garage.jobs SET plate_entered = $2, vehicle_id = $3, work_types = $4, form = $5, client_created_at = $6, version = version + 1
        WHERE id = $1 AND status = 'draft' AND ($7::int IS NULL OR version = $7)`,
      [j.id, j.plateEntered, j.vehicleId, j.workTypes, JSON.stringify(j.form), j.clientCreatedAt, j.expectedVersion ?? null]);
    return r.rowCount === 1;
  }

  async setCustomer(sql: Sql, jobId: string, c: { partyId: string | null; phoneProvided: boolean; smsConsent: boolean } | null): Promise<void> {
    if (!c) {
      await sql.query('DELETE FROM garage.job_customers WHERE job_id = $1', [jobId]);
      return;
    }
    await sql.query(
      `INSERT INTO garage.job_customers (job_id, party_id, phone_provided, sms_consent) VALUES ($1,$2,$3,$4)
       ON CONFLICT (job_id) DO UPDATE SET party_id = EXCLUDED.party_id, phone_provided = EXCLUDED.phone_provided, sms_consent = EXCLUDED.sms_consent`,
      [jobId, c.partyId, c.phoneProvided, c.smsConsent]);
  }

  /** Claim a draft for submission (one winner if two taps race). */
  async claimForSubmit(id: string, key: string, acknowledged: object[]): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE garage.jobs SET status = 'submitted', submitted_at = now(), submit_idempotency_key = $2, acknowledged_warnings = $3, version = version + 1
        WHERE id = $1 AND status = 'draft'`, [id, key, JSON.stringify(acknowledged)]);
    return r.rowCount === 1;
  }

  async releaseClaim(id: string): Promise<void> {
    await this.pool.query(`UPDATE garage.jobs SET status = 'draft', submitted_at = NULL, submit_idempotency_key = NULL WHERE id = $1 AND submission_id IS NULL`, [id]);
  }

  async recordOutcome(id: string, o: { submissionId: string; status: JobStatus; vehicleId: string | null; rejectionReason: string | null }): Promise<void> {
    await this.pool.query(
      `UPDATE garage.jobs SET submission_id = $2, status = $3, vehicle_id = COALESCE($4, vehicle_id), rejection_reason = $5 WHERE id = $1`,
      [id, o.submissionId, o.status, o.vehicleId, o.rejectionReason]);
  }

  async setAttestationRequest(jobId: string, requestId: string): Promise<void> {
    await this.pool.query('UPDATE garage.job_customers SET attestation_request_id = $2 WHERE job_id = $1', [jobId, requestId]);
  }

  async jobByAttestationRequest(requestId: string): Promise<JobRow | undefined> {
    const { rows } = await this.pool.query<JobRow>(
      `SELECT ${COLS} FROM garage.jobs j JOIN garage.job_customers c ON c.job_id = j.id WHERE c.attestation_request_id = $1`, [requestId]);
    return rows[0] && fix(rows[0]);
  }
}
