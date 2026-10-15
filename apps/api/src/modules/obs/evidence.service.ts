// Evidence uploads (API Outline §5.6): reserve a slot → send the bytes → complete (server re-hashes).
// Only a completed, verified upload becomes an obs.evidence_files row that records can point to.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EvidenceKind } from '@sazo/contracts';
import pg from 'pg';
import { EventBus } from '../../platform/event-bus.js';
import { DB_POOL } from '../../platform/tokens.js';
import { OBJECT_STORE, type ObjectStore } from './evidence-store.js';
import { ObservationsService } from './observations.service.js';
import { PHOTO_RULES, REASON_TEXT, localFindings, photoFacts, type CheckFinding } from './photo-checks.js';

export const UPLOAD_TTL_MINUTES = 60;

export class EvidenceError extends Error {
  constructor(readonly code: 'upload_not_found' | 'upload_expired' | 'already_uploaded' | 'size_mismatch' | 'hash_mismatch' | 'content_missing', message: string) {
    super(message);
  }
}

export type PhotoStatus = 'ok' | 'needs_checking' | 'cleared' | 'rejected';

/** X-01: what the photo checks found. `problems` lists only the open flags, in plain words. */
export interface PhotoCheckView {
  status: PhotoStatus;
  problems: { check: string; reason: string; message: string }[];
}

export interface EvidenceFileView {
  evidenceId: string; kind: EvidenceKind; sha256: string; mimeType: string; sizeBytes: number; capturedAt: string | null; uploadedAt: string;
  checks: PhotoCheckView;
}

interface UploadRow {
  id: string; kind: EvidenceKind; mimeType: string; sizeBytes: number; sha256: string; capturedAt: Date | null; storageKey: string;
  uploadedBy: string; expiresAt: Date; contentReceivedAt: Date | null; evidenceFileId: string | null;
}

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(DB_POOL) private readonly pool: pg.Pool,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(ObservationsService) private readonly observations: ObservationsService,
    @Inject(EventBus) private readonly bus: EventBus,
  ) {}

  async start(userId: string, u: { kind: EvidenceKind; mimeType: string; sizeBytes: number; sha256: string; capturedAt?: string }): Promise<{ uploadId: string; expiresAt: string }> {
    const now = new Date();
    const key = `evidence/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}`;
    const { rows } = await this.pool.query<{ id: string; expires_at: Date }>(
      `INSERT INTO obs.evidence_uploads (kind, mime_type, size_bytes, sha256, captured_at, storage_key, uploaded_by_user_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(mins => $8)) RETURNING id, expires_at`,
      [u.kind, u.mimeType, u.sizeBytes, u.sha256, u.capturedAt ?? null, key, userId, UPLOAD_TTL_MINUTES],
    );
    return { uploadId: rows[0]!.id, expiresAt: rows[0]!.expires_at.toISOString() };
  }

  private async upload(id: string, userId: string): Promise<UploadRow> {
    const { rows } = await this.pool.query<UploadRow>(
      `SELECT id, kind, mime_type AS "mimeType", size_bytes::int AS "sizeBytes", sha256, captured_at AS "capturedAt", storage_key AS "storageKey",
              uploaded_by_user_id AS "uploadedBy", expires_at AS "expiresAt", content_received_at AS "contentReceivedAt",
              evidence_file_id AS "evidenceFileId"
         FROM obs.evidence_uploads WHERE id = $1`, [id]);
    // Someone else's upload looks like a missing one.
    if (!rows[0] || rows[0].uploadedBy !== userId) throw new EvidenceError('upload_not_found', 'No such upload');
    return rows[0];
  }

  /** Receive the bytes (local store). Checked against the declared size and hash before anything is kept. */
  async putContent(id: string, userId: string, bytes: Buffer): Promise<void> {
    const u = await this.upload(id, userId);
    if (u.contentReceivedAt) throw new EvidenceError('already_uploaded', 'This upload already has its content');
    if (u.expiresAt.getTime() < Date.now()) throw new EvidenceError('upload_expired', 'The upload slot has expired; start again');
    if (bytes.length !== u.sizeBytes) throw new EvidenceError('size_mismatch', `Expected ${u.sizeBytes} bytes, received ${bytes.length}`);
    if (createHash('sha256').update(bytes).digest('hex') !== u.sha256) throw new EvidenceError('hash_mismatch', 'The file does not match its declared SHA-256');
    await this.store.putOnce(u.storageKey, bytes);
    await this.pool.query('UPDATE obs.evidence_uploads SET content_received_at = now() WHERE id = $1', [id]);
  }

  /** Verify the stored bytes again and register the evidence file. Safe to call twice. */
  async complete(id: string, userId: string): Promise<EvidenceFileView & { uploadedBy: string | null }> {
    const u = await this.upload(id, userId);
    if (u.evidenceFileId) return (await this.view([u.evidenceFileId]))[0]!;
    const bytes = await this.store.get(u.storageKey);
    if (!bytes) throw new EvidenceError('content_missing', 'Upload the file before completing');
    if (bytes.length !== u.sizeBytes) throw new EvidenceError('size_mismatch', 'Stored size does not match');
    if (createHash('sha256').update(bytes).digest('hex') !== u.sha256) throw new EvidenceError('hash_mismatch', 'Stored file does not match its hash');
    // The evidence file keeps the upload's id, so the id the phone got at the start is the one it puts in the job.
    const evidenceId = await this.observations.registerEvidence({
      id: u.id,
      storageKey: u.storageKey, sha256: u.sha256, mimeType: u.mimeType, sizeBytes: u.sizeBytes, kind: u.kind,
      capturedAt: u.capturedAt ? u.capturedAt.toISOString() : null, uploadedByUserId: userId,
    });
    await this.pool.query('UPDATE obs.evidence_uploads SET evidence_file_id = $2 WHERE id = $1', [id, evidenceId]);
    await this.runChecks(evidenceId, bytes, u);
    return (await this.view([evidenceId]))[0]!;
  }

  /**
   * X-01 step 1: is it a readable photo, big and bright enough, taken recently, and not a photo SAZO has
   * seen before (exactly, or a near copy)? Findings are stored, never used to refuse the upload — the
   * phone may be uploading hours after the car left — so a flagged photo waits for a reviewer instead.
   */
  private async runChecks(evidenceId: string, bytes: Buffer, u: UploadRow): Promise<void> {
    const done = await this.pool.query('SELECT 1 FROM obs.evidence_checks WHERE evidence_file_id = $1 LIMIT 1', [evidenceId]);
    if (done.rowCount) return;
    const facts = await photoFacts(bytes, u.mimeType);
    const findings: CheckFinding[] = localFindings(u.mimeType, facts, u.capturedAt, new Date());

    const same = await this.pool.query<{ uploaded_at: Date }>(
      'SELECT uploaded_at FROM obs.evidence_files WHERE sha256 = $1 AND id <> $2 ORDER BY uploaded_at LIMIT 1', [u.sha256, evidenceId]);
    if (same.rows[0]) {
      findings.push({ check: 'duplicate', outcome: 'flag', reason: 'same_photo_used_before', detail: { firstSeenAt: same.rows[0].uploaded_at.toISOString() } });
    } else if (facts) {
      const near = await this.pool.query<{ bits: number; evidence_file_id: string }>(
        `SELECT evidence_file_id, bit_count((dhash # $1::bigint)::bit(64))::int AS bits FROM obs.evidence_fingerprints
          WHERE kind = $2 AND evidence_file_id <> $3 ORDER BY bits LIMIT 1`, [facts.dhash, u.kind, evidenceId]);
      const n = near.rows[0];
      findings.push(n && n.bits <= PHOTO_RULES.nearCopyBits
        ? { check: 'duplicate', outcome: 'flag', reason: 'near_copy_of_earlier_photo', detail: { bitsApart: n.bits, earlierEvidenceId: n.evidence_file_id } }
        : { check: 'duplicate', outcome: 'pass' });
    }
    if (facts) {
      await this.pool.query(
        `INSERT INTO obs.evidence_fingerprints (evidence_file_id, kind, dhash, width, height) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [evidenceId, u.kind, facts.dhash, facts.width, facts.height]);
    }
    for (const f of findings) {
      await this.pool.query(
        `INSERT INTO obs.evidence_checks (evidence_file_id, check_name, outcome, reason, detail) VALUES ($1,$2,$3,$4,$5)`,
        [evidenceId, f.check, f.outcome, f.reason ?? null, JSON.stringify({ ...(f.detail ?? {}), ...(facts ? { width: facts.width, height: facts.height, brightness: facts.brightness } : {}) })]);
    }
  }

  /** Each file's check status and open problems. Files with no checks (seeded or older records) are 'ok'. */
  async checks(ids: string[]): Promise<Map<string, PhotoCheckView>> {
    if (!ids.length) return new Map();
    const { rows } = await this.pool.query<{ id: string; status: PhotoStatus; problems: { check: string; reason: string }[] }>(
      `SELECT s.evidence_file_id AS id, s.status,
              COALESCE((SELECT json_agg(json_build_object('check', c.check_name, 'reason', c.reason) ORDER BY c.checked_at)
                          FROM obs.evidence_checks c WHERE c.evidence_file_id = s.evidence_file_id AND c.outcome = 'flag'), '[]') AS problems
         FROM obs.evidence_status s WHERE s.evidence_file_id = ANY($1)`, [ids]);
    return new Map(rows.map((r) => [r.id, {
      status: r.status,
      problems: r.status === 'needs_checking' ? r.problems.map((p) => ({ ...p, message: REASON_TEXT[p.reason as keyof typeof REASON_TEXT] ?? p.reason })) : [],
    }]));
  }

  /** Photos waiting for a reviewer, oldest first (X-01). */
  async needsChecking(limit = 100) {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT s.evidence_file_id AS id FROM obs.evidence_status s JOIN obs.evidence_files f ON f.id = s.evidence_file_id
        WHERE s.status = 'needs_checking' ORDER BY f.uploaded_at LIMIT $1`, [limit]);
    const ids = rows.map((r) => r.id);
    const [views, vehicles] = await Promise.all([this.view(ids), this.vehiclesOf(ids)]);
    return views.map(({ uploadedBy: _u, ...v }) => ({ ...v, vehicleIds: vehicles.get(v.evidenceId) ?? [] }));
  }

  private async vehiclesOf(ids: string[]): Promise<Map<string, string[]>> {
    if (!ids.length) return new Map();
    const { rows } = await this.pool.query<{ id: string; vehicles: string[] }>(
      `SELECT oe.evidence_file_id AS id, array_agg(DISTINCT o.vehicle_id) AS vehicles
         FROM obs.observation_evidence oe JOIN obs.observations o ON o.id = oe.observation_id
        WHERE oe.evidence_file_id = ANY($1) GROUP BY oe.evidence_file_id`, [ids]);
    return new Map(rows.map((r) => [r.id, r.vehicles]));
  }

  /** A reviewer clears a flagged photo (it counts as evidence again) or rejects it; the cars it backs are re-weighed. */
  async review(evidenceId: string, reviewerUserId: string, decision: 'clear' | 'reject', reason: string): Promise<boolean> {
    const exists = await this.pool.query('SELECT 1 FROM obs.evidence_files WHERE id = $1', [evidenceId]);
    if (!exists.rowCount) return false;
    const vehicles = (await this.vehiclesOf([evidenceId])).get(evidenceId) ?? [];
    await this.bus.transaction(async (tx, emit) => {
      await tx.query(
        `INSERT INTO obs.evidence_checks (evidence_file_id, check_name, outcome, reason, reviewer_user_id) VALUES ($1,'review',$2,$3,$4)`,
        [evidenceId, decision === 'clear' ? 'cleared' : 'rejected', reason, reviewerUserId]);
      for (const vehicleId of vehicles) await emit('obs', { type: 'evidence.reviewed', aggregateId: vehicleId, payload: { vehicleId, evidenceId, decision } });
    });
    return true;
  }

  /** The stored bytes of a completed evidence file (write-once storage). */
  async content(evidenceId: string): Promise<{ bytes: Buffer; mime: string; uploadedBy: string | null } | undefined> {
    const { rows } = await this.pool.query<{ storage_key: string; mime_type: string; uploaded_by_user_id: string | null }>(
      'SELECT storage_key, mime_type, uploaded_by_user_id FROM obs.evidence_files WHERE id = $1', [evidenceId]);
    if (!rows[0]) return undefined;
    const bytes = await this.store.get(rows[0].storage_key);
    return bytes ? { bytes, mime: rows[0].mime_type, uploadedBy: rows[0].uploaded_by_user_id } : undefined;
  }

  async view(ids: string[]): Promise<(EvidenceFileView & { uploadedBy: string | null })[]> {
    if (!ids.length) return [];
    const { rows } = await this.pool.query(
      `SELECT id AS "evidenceId", kind, sha256, mime_type AS "mimeType", size_bytes::int AS "sizeBytes", captured_at AS "capturedAt",
              uploaded_at AS "uploadedAt", uploaded_by_user_id AS "uploadedBy"
         FROM obs.evidence_files WHERE id = ANY($1)`, [ids]);
    const checks = await this.checks(ids);
    return rows.map((r) => ({ ...r, capturedAt: r.capturedAt ? new Date(r.capturedAt).toISOString() : null, uploadedAt: new Date(r.uploadedAt).toISOString(),
      checks: checks.get(r.evidenceId) ?? { status: 'ok' as const, problems: [] } }));
  }
}
