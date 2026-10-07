// Ingest admin (API Outline §5.9): the ambiguous-identity queue and data-source management.
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, IamService, RequirePermission, type Actor } from '../iam/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { IngestionService } from './ingestion.service.js';
import type { SourceRow } from './sources.repository.js';

const Uuid = z.string().uuid();
const Outcome = z.enum(['matched', 'created_new', 'created_provisional', 'ambiguous', 'rejected']);
const Decide = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('matched'), vehicleRef: z.string(), reason: z.string().trim().min(3) }),
  z.object({ outcome: z.literal('created_new'), reason: z.string().trim().min(3) }),
  z.object({ outcome: z.literal('rejected'), reason: z.string().trim().min(3) }),
]);
const SourcePatch = z.object({
  status: z.enum(['active', 'paused', 'retired']).optional(),
  supersededBySourceId: Uuid.nullable().optional(),
  reason: z.string().trim().min(3),
}).refine((b) => b.status !== undefined || b.supersededBySourceId !== undefined, { message: 'Send status and/or supersededBySourceId' });

const sourceView = (s: SourceRow) => ({
  id: s.id, code: s.code, name: s.name, domain: s.domain, channel: s.channel, isSimulated: s.isSimulated,
  evidenceClass: s.evidenceClass, baselineReputation: s.baselineReputation, status: s.status,
  supersededBySourceId: s.supersededBySourceId,
  coverage: s.coverage.map((c) => ({ scope: c.scope, periodFrom: c.from, periodTo: c.to ?? null })),
});

@Controller('admin')
export class IngestAdminController {
  constructor(
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /** GET /v1/admin/resolutions?outcome=ambiguous — operationId adminListResolutions. */
  @Get('resolutions')
  @RequirePermission('identity.resolve')
  async resolutions(@Query('outcome') outcome?: string, @Query('limit') limit?: string) {
    const o = outcome === undefined ? undefined : Outcome.safeParse(outcome);
    if (o && !o.success) throw badRequest('invalid_query', 'Unknown outcome');
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return { items: await this.registry.listDecisions(o?.data, n), nextCursor: null };
  }

  /** POST /v1/admin/resolutions/:decisionId/decide — operationId adminDecideResolution. */
  @Post('resolutions/:decisionId/decide')
  @HttpCode(200)
  @RequirePermission('identity.resolve')
  async decide(@CurrentActor() actor: Actor, @Param('decisionId') decisionId: string, @Body() body: unknown) {
    const b = Decide.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'outcome and reason are required (vehicleRef when matching)');
    if (!Uuid.safeParse(decisionId).success) throw notFound('decision_not_found', 'No such decision');
    const d = await this.registry.getDecision(decisionId);
    if (!d) throw notFound('decision_not_found', 'No such decision');
    if (d.outcome !== 'ambiguous' || !(await this.registry.isLatestDecision(decisionId))) {
      throw new Problem(409, 'already_decided', 'Conflict', 'This match has already been decided');
    }

    if (b.data.outcome === 'rejected') {
      await this.ingestion.rejectAmbiguousItem(d.submissionItemId, actor.userId);
    } else {
      let vehicleId: string | undefined;
      if (b.data.outcome === 'matched') {
        vehicleId = await this.registry.idForRef(b.data.vehicleRef);
        if (!vehicleId || !d.candidates.includes(vehicleId)) throw badRequest('not_a_candidate', 'vehicleRef must be one of the candidates');
      }
      await this.ingestion.resolveAmbiguousItem(d.submissionItemId, vehicleId ? { vehicleId } : { createNew: true }, actor.userId);
    }
    await this.iam.audit({ actor, action: `identity.${b.data.outcome}`, targetType: 'resolution_decision', targetId: decisionId, details: { reason: b.data.reason } });
    const [latest] = (await this.registry.listDecisions(undefined, 200)).filter((x) => x.submissionItemId === d.submissionItemId);
    return latest;
  }

  /** GET /v1/admin/sources — operationId adminListSources. */
  @Get('sources')
  @RequirePermission('source.manage')
  async sources() {
    return (await this.ingestion.listSources()).map(sourceView);
  }

  /** PATCH /v1/admin/sources/:id — pause, retire or supersede (D-011, X1). Trust re-weighs affected vehicles. */
  @Patch('sources/:id')
  @RequirePermission('source.manage')
  async updateSource(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const b = SourcePatch.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Send status and/or supersededBySourceId, with a reason');
    if (!Uuid.safeParse(id).success || !(await this.ingestion.sourceById(id))) throw notFound('source_not_found', 'No such source');
    if (b.data.supersededBySourceId) {
      if (b.data.supersededBySourceId === id || !(await this.ingestion.sourceById(b.data.supersededBySourceId))) {
        throw badRequest('invalid_successor', 'supersededBySourceId must be another existing source');
      }
    }
    const { reason, ...change } = b.data;
    const updated = await this.ingestion.updateSource(id, change);
    await this.iam.audit({ actor, action: 'source.updated', targetType: 'source', targetId: id, details: { ...change, reason } });
    return sourceView(updated);
  }
}
