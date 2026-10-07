// Evidence uploads (API Outline §5.6): reserve a slot → send the bytes → complete (server re-hashes).
// Only a completed, verified upload becomes an obs.evidence_files row that records can point to.
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EvidenceKind } from '@sazo/contracts';
import pg from 'pg';
import { DB_POOL } from '../../platform/tokens.js';
import { OBJECT_STORE, type ObjectStore } from './evidence-store.js';
import { ObservationsService } from './observations.service.js';

export const UPLOAD_TTL_MINUTES = 60;

export class EvidenceError extends Error {
  constructor(readonly code: 'upload_not_found' | 'upload_expired' | 'already_uploaded' | 'size_mismatch' | 'hash_mismatch' | 'content_missing', message: string) {
    super(message);
  }
}

export interface EvidenceFileView {
  evidenceId: string; kind: EvidenceKind; sha256: string; mimeType: string; sizeBytes: number; capturedAt: string | null; uploadedAt: string;
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
    return (await this.view([evidenceId]))[0]!;
  }

  async view(ids: string[]): Promise<(EvidenceFileView & { uploadedBy: string | null })[]> {
    if (!ids.length) return [];
    const { rows } = await this.pool.query(
      `SELECT id AS "evidenceId", kind, sha256, mime_type AS "mimeType", size_bytes::int AS "sizeBytes", captured_at AS "capturedAt",
              uploaded_at AS "uploadedAt", uploaded_by_user_id AS "uploadedBy"
         FROM obs.evidence_files WHERE id = ANY($1)`, [ids]);
    return rows.map((r) => ({ ...r, capturedAt: r.capturedAt ? new Date(r.capturedAt).toISOString() : null, uploadedAt: new Date(r.uploadedAt).toISOString() }));
  }
}
