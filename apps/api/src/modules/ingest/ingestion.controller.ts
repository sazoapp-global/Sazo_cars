import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { canForOrg, CurrentActor, type Actor, type OrgAccess } from '../iam/index.js';
import { IngestionError, IngestionService, type SubmissionResult } from './ingestion.service.js';

const TimeSchema = z.object({
  at: z.string().datetime({ offset: true }).nullable(),
  precision: z.enum(['exact', 'day', 'month', 'year', 'unknown']),
});
const SubmissionSchema = z.object({
  schemaVersion: z.number().int().positive(),
  items: z.array(z.object({
    identifiers: z.object({
      vin: z.string().optional(),
      chassisNumber: z.string().optional(),
      plate: z.string().optional(),
      engineNumber: z.string().optional(),
    }),
    records: z.array(z.object({
      type: z.string(),
      attributes: z.record(z.string(), z.unknown()),
      time: TimeSchema,
      evidenceIds: z.array(z.string().uuid()).optional(),
      sourceRecordId: z.string().optional(),
    })).min(1),
  })).min(1).max(1000),
});

/** Never expose internal UUIDs over HTTP — vehicles are addressed by public reference (DM-8). */
const publicView = (r: Omit<SubmissionResult, 'replayed'>) => ({
  submissionId: r.submissionId,
  sourceCode: r.sourceCode,
  status: r.status,
  items: r.items.map(({ vehicleId: _internal, observationIds: _ids, ...rest }) => rest),
});

/** Organisation-scoped refusals (D-055/X4): a pending or suspended business cannot submit anything. */
function deny(access: Exclude<OrgAccess, { ok: true }>): never {
  if (access.code === 'organisation_not_approved') {
    throw new Problem(403, 'organisation_not_approved', 'Forbidden', 'Your organisation has not been approved yet');
  }
  throw new Problem(403, 'source_not_permitted', 'Forbidden', 'You cannot use this source');
}

@Controller('ingest/submissions')
export class IngestionController {
  constructor(@Inject(IngestionService) private readonly ingestion: IngestionService) {}

  /**
   * POST /v1/ingest/submissions — operationId createSubmission.
   * The caller must act for the organisation that owns the source (or be a SAZO admin).
   */
  @Post()
  @HttpCode(202)
  async create(@CurrentActor() actor: Actor, @Body() body: unknown, @Headers('idempotency-key') key?: string, @Headers('x-source-code') sourceCode?: string) {
    if (!key || !z.string().uuid().safeParse(key).success) throw badRequest('idempotency_key_required', 'Send an Idempotency-Key header (UUID)');
    if (!sourceCode) throw badRequest('source_required', 'Send an X-Source-Code header');
    const source = await this.ingestion.sourceByCode(sourceCode);
    if (!source) throw new Problem(403, 'source_not_permitted', 'Forbidden', 'You cannot use this source');
    const access = canForOrg(actor, source.organisationId, 'submission.create');
    if (!access.ok) deny(access);

    const parsed = SubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('invalid_submission', 'The submission does not match the schema',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
    }
    try {
      const r = await this.ingestion.submit(sourceCode, parsed.data, { idempotencyKey: key, userId: actor.userId, organisationId: source.organisationId });
      return { ...publicView(r), statusUrl: `/v1/ingest/submissions/${r.submissionId}` };
    } catch (err) {
      if (err instanceof IngestionError) {
        if (err.code === 'idempotency_key_reused') throw new Problem(409, err.code, 'Conflict', err.message);
        throw new Problem(403, err.code, 'Forbidden', err.message);
      }
      throw err;
    }
  }

  /** GET /v1/ingest/submissions/:id — operationId getSubmission. */
  @Get(':id')
  async get(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (!z.string().uuid().safeParse(id).success) throw notFound('submission_not_found', 'No such submission');
    const orgId = await this.ingestion.submissionOrganisation(id);
    // Someone else's submission looks exactly like a missing one (no discovery).
    if (!orgId || !canForOrg(actor, orgId, 'submission.read').ok) throw notFound('submission_not_found', 'No such submission');
    const r = await this.ingestion.get(id);
    if (!r) throw notFound('submission_not_found', 'No such submission');
    return publicView(r);
  }
}
