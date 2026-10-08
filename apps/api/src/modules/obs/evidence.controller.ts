// POST /v1/evidence/uploads → PUT /v1/evidence/uploads/:id/content → POST /v1/evidence/:id/complete
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req, StreamableFile } from '@nestjs/common';
import { EVIDENCE_KINDS } from '@sazo/contracts';
import type { Request } from 'express';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, type Actor } from '../iam/index.js';
import { EvidenceError, EvidenceService } from './evidence.service.js';

const Start = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  sizeBytes: z.number().int().min(1).max(15_000_000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  capturedAt: z.string().datetime({ offset: true }).optional(),
});
const Uuid = z.string().uuid();

function toProblem(err: unknown): never {
  if (err instanceof EvidenceError) {
    if (err.code === 'upload_not_found') throw notFound(err.code, err.message);
    if (err.code === 'already_uploaded') throw new Problem(409, err.code, 'Conflict', err.message);
    if (err.code === 'upload_expired') throw new Problem(410, err.code, 'Gone', err.message);
    throw new Problem(422, err.code, 'Unprocessable', err.message);
  }
  throw err;
}

@Controller('evidence')
export class EvidenceController {
  constructor(
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** Reserve an upload slot (operationId startEvidenceUpload). The phone hashes the file first. */
  @Post('uploads')
  async start(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = Start.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const { uploadId, expiresAt } = await this.evidence.start(actor.userId, b.data);
    // With S3 this becomes a pre-signed URL; the client contract (PUT the bytes, then complete) stays the same.
    return { evidenceId: uploadId, uploadUrl: `${this.cfg.PUBLIC_API_URL}/v1/evidence/uploads/${uploadId}/content`, uploadMethod: 'PUT', expiresAt };
  }

  /** The bytes (raw body, any image/PDF content type). */
  @Put('uploads/:id/content')
  @HttpCode(204)
  async content(@CurrentActor() actor: Actor, @Param('id') id: string, @Req() req: Request) {
    if (!Uuid.safeParse(id).success) throw notFound('upload_not_found', 'No such upload');
    if (!Buffer.isBuffer(req.body)) throw badRequest('invalid_content', 'Send the file bytes as the request body');
    await this.evidence.putContent(id, actor.userId, req.body).catch(toProblem);
  }

  /** Confirm the upload; the server re-checks size and hash (operationId completeEvidenceUpload). */
  @Post(':id/complete')
  @HttpCode(200)
  async complete(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!Uuid.safeParse(id).success) throw notFound('upload_not_found', 'No such upload');
    const { uploadedBy: _uploader, ...view } = await this.evidence.complete(id, actor.userId).catch(toProblem);
    return view;
  }

  /**
   * GET /v1/evidence/:id/content — the photo or document itself. For the person who uploaded it and for
   * SAZO reviewers only; buyers see that a photo exists, never the photo (it may show people or places).
   */
  @Get(':id/content')
  async file(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!Uuid.safeParse(id).success) throw notFound('evidence_not_found', 'No such file');
    const f = await this.evidence.content(id);
    const reviewer = actor.permissions.has('conflict.review') || actor.permissions.has('organisation.approve') || actor.permissions.has('ownership.review');
    if (!f || (f.uploadedBy !== actor.userId && !reviewer)) throw notFound('evidence_not_found', 'No such file');
    return new StreamableFile(f.bytes, { type: f.mime, disposition: 'inline', length: f.bytes.length });
  }

  /** Receipt reading (D-027) is not built yet. */
  @Post(':id/ocr')
  ocr() {
    throw new Problem(501, 'not_implemented', 'Not implemented', 'Reading receipts automatically is not available yet');
  }
}
