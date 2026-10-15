// X-01: photos the automatic checks flagged, waiting for a SAZO reviewer to clear or reject them.
// (The full three-pane review queue comes with Phase B; these are the calls it will use.)
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, RequirePermission, type Actor } from '../iam/index.js';
import { EvidenceService } from './evidence.service.js';

const Uuid = z.string().uuid();
const Decision = z.object({ decision: z.enum(['clear', 'reject']), reason: z.string().trim().min(3).max(1000) });

@Controller('admin/photos')
export class PhotoReviewController {
  constructor(@Inject(EvidenceService) private readonly evidence: EvidenceService) {}

  /** GET /v1/admin/photos/needs-checking — operationId adminListPhotosNeedingChecks. */
  @Get('needs-checking')
  @RequirePermission('conflict.review')
  async list() {
    return { items: await this.evidence.needsChecking() };
  }

  /** POST /v1/admin/photos/:id/review — operationId adminReviewPhoto. */
  @Post(':id/review')
  @HttpCode(204)
  @RequirePermission('conflict.review')
  async review(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    if (!Uuid.safeParse(id).success) throw notFound('evidence_not_found', 'No such photo');
    const b = Decision.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'decision must be clear or reject, with a reason');
    if (!(await this.evidence.review(id, actor.userId, b.data.decision, b.data.reason))) throw notFound('evidence_not_found', 'No such photo');
  }
}
