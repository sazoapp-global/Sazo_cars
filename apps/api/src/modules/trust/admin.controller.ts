// Trust admin (API Outline §5.9): the conflict review queue and rebuilds.
import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { CurrentActor, IamService, RequirePermission, type Actor } from '../iam/index.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { ConflictActionError, ConflictsService } from './conflicts.service.js';
import { TrustService } from './trust.service.js';

const Uuid = z.string().uuid();
const Status = z.enum(['open', 'under_review', 'auto_resolved', 'resolved', 'dismissed']);
const Topic = z.enum(['mileage', 'identity', 'ownership', 'damage', 'finance', 'spec', 'care', 'legal']);
const Action = z.object({
  action: z.enum(['assign', 'comment', 'start_review', 'resolve', 'dismiss', 'reopen']),
  assigneeUserId: Uuid.optional(),
  comment: z.string().max(4000).optional(),
  interpretation: z.string().max(4000).optional(),
  reasoning: z.string().max(4000).optional(),
  relations: z.array(z.object({ kind: z.enum(['corrects', 'retracts', 'duplicates']), fromObservationId: Uuid, toObservationId: Uuid })).max(50).optional(),
  plateDispute: z.object({ plate: z.string().min(2).max(32), keepVehicleRef: z.string() }).optional(),
});
const Rebuild = z.object({ vehicleRef: z.string().optional(), asOf: z.string().datetime({ offset: true }).optional() });

@Controller('admin')
export class TrustAdminController {
  constructor(
    @Inject(ConflictsService) private readonly conflicts: ConflictsService,
    @Inject(TrustService) private readonly trust: TrustService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  /** GET /v1/admin/conflicts — operationId adminListConflicts (default: open and under review). */
  @Get('conflicts')
  @RequirePermission('conflict.review')
  async list(@Query('status') status?: string, @Query('topic') topic?: string, @Query('limit') limit?: string) {
    const s = status === undefined ? undefined : Status.safeParse(status);
    const t = topic === undefined ? undefined : Topic.safeParse(topic);
    if ((s && !s.success) || (t && !t.success)) throw badRequest('invalid_query', 'Unknown status or topic');
    const items = await this.conflicts.list({ status: s?.data, topic: t?.data, limit: Math.min(Math.max(Number(limit) || 50, 1), 200) });
    return { items, nextCursor: null };
  }

  /** GET /v1/admin/conflicts/:id — operationId adminGetConflict. */
  @Get('conflicts/:id')
  @RequirePermission('conflict.review')
  async get(@Param('id') id: string) {
    const d = Uuid.safeParse(id).success ? await this.conflicts.detail(id) : undefined;
    if (!d) throw notFound('conflict_not_found', 'No such conflict');
    return d;
  }

  /** POST /v1/admin/conflicts/:id/actions — operationId adminActOnConflict. Resolving/dismissing needs conflict.resolve. */
  @Post('conflicts/:id/actions')
  @HttpCode(200)
  @RequirePermission('conflict.review')
  async act(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const b = Action.safeParse(body);
    if (!b.success) throw badRequest('invalid_request', 'Check the fields', b.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    if (['resolve', 'dismiss', 'reopen'].includes(b.data.action) && !actor.permissions.has('conflict.resolve')) {
      throw new Problem(403, 'forbidden', 'Forbidden', 'Missing permission conflict.resolve');
    }
    if (!Uuid.safeParse(id).success) throw notFound('conflict_not_found', 'No such conflict');
    try {
      const updated = await this.conflicts.act(id, actor.userId, b.data);
      if (!updated) throw notFound('conflict_not_found', 'No such conflict');
      await this.iam.audit({ actor, action: `conflict.${b.data.action}`, targetType: 'conflict', targetId: id, details: b.data });
      return updated;
    } catch (err) {
      if (err instanceof ConflictActionError) {
        throw err.code === 'invalid_transition'
          ? new Problem(409, err.code, 'Conflict', err.message)
          : badRequest(err.code, err.message);
      }
      throw err;
    }
  }

  /** POST /v1/admin/rebuilds — operationId adminStartRebuild (runs in-process until the worker exists). */
  @Post('rebuilds')
  @HttpCode(202)
  @RequirePermission('ruleset.activate')
  async rebuild(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const b = Rebuild.safeParse(body ?? {});
    if (!b.success) throw badRequest('invalid_request', 'vehicleRef and asOf are optional; asOf must be a date-time');
    let vehicleId: string | undefined;
    if (b.data.vehicleRef) {
      vehicleId = await this.registry.idForRef(b.data.vehicleRef);
      if (!vehicleId) throw notFound('vehicle_not_found', 'No such vehicle');
    }
    const jobId = randomUUID();
    const vehicles = await this.trust.rebuild({ vehicleId, asOf: b.data.asOf });
    await this.iam.audit({ actor, action: 'trust.rebuild', targetType: 'rebuild', targetId: jobId, details: { ...b.data, vehicles } });
    return { jobId, status: 'done', vehicles };
  }
}
