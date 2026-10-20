// What the partner console needs: the sources the signed-in person may submit for, and their history.
import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Problem, badRequest, notFound } from '../../platform/problem.js';
import { canForOrg, CurrentActor, type Actor } from '../iam/index.js';
import { IngestionService, RecordChangeError } from './ingestion.service.js';

const WithdrawSchema = z.object({ reason: z.string().trim().min(5).max(300) });

@Controller('ingest/sources')
export class PartnerController {
  constructor(@Inject(IngestionService) private readonly ingestion: IngestionService) {}

  /** GET /v1/ingest/sources — active sources this person can submit for (SAZO admins: all). Garages use the Garage app. */
  @Get()
  async sources(@CurrentActor() actor: Actor) {
    return (await this.ingestion.listSources())
      .filter((s) => s.status === 'active' && s.channel !== 'garage_app' && s.channel !== 'inspector_app' && !(s.domain === 'dealer' && !s.isSimulated) && canForOrg(actor, s.organisationId, 'submission.create').ok)
      .map((s) => ({ code: s.code, name: s.name, domain: s.domain, channel: s.channel, isSimulated: s.isSimulated, evidenceClass: s.evidenceClass }));
  }

  /** GET /v1/ingest/sources/:code/submissions — recent submissions for one source. */
  @Get(':code/submissions')
  async submissions(@CurrentActor() actor: Actor, @Param('code') code: string, @Query('limit') limit?: string) {
    const source = await this.ingestion.sourceByCode(code);
    if (!source || !canForOrg(actor, source.organisationId, 'submission.read').ok) throw notFound('source_not_found', 'No such source');
    return { items: await this.ingestion.recentSubmissions(source.id, Math.min(Math.max(Number(limit) || 20, 1), 100)), nextCursor: null };
  }

  /** GET /v1/ingest/sources/:code/records — P-05: recent records this source sent, with their state. */
  @Get(':code/records')
  async records(@CurrentActor() actor: Actor, @Param('code') code: string, @Query('limit') limit?: string) {
    const source = await this.ingestion.sourceByCode(code);
    if (!source || !canForOrg(actor, source.organisationId, 'submission.read').ok) throw notFound('source_not_found', 'No such source');
    return { items: await this.ingestion.recordsOfSource(source.id, Math.min(Math.max(Number(limit) || 30, 1), 100)), nextCursor: null };
  }

  /**
   * POST /v1/ingest/sources/:code/records/:observationId/withdraw — P-05: withdraw a record sent by mistake, with a reason.
   * The record is never deleted; it stays in the car's history marked withdrawn and no longer counts.
   * To fix a record instead, send a new one with `correctsObservationId`.
   */
  @Post(':code/records/:observationId/withdraw')
  @HttpCode(200)
  async withdraw(@CurrentActor() actor: Actor, @Param('code') code: string, @Param('observationId', new ParseUUIDPipe()) observationId: string, @Body() body: unknown) {
    const source = await this.ingestion.sourceByCode(code);
    if (!source || source.channel === 'garage_app' || source.channel === 'inspector_app') throw notFound('source_not_found', 'No such source');
    const access = canForOrg(actor, source.organisationId, 'submission.create');
    if (!access.ok) {
      if (access.code === 'organisation_not_approved') throw new Problem(403, 'organisation_not_approved', 'Business not approved', 'Your business must be approved by SAZO first');
      throw notFound('source_not_found', 'No such source');
    }
    const parsed = WithdrawSchema.safeParse(body);
    if (!parsed.success) throw badRequest('invalid_reason', 'Give a reason of at least 5 characters', parsed.error.issues);
    try {
      await this.ingestion.withdraw(source, observationId, parsed.data.reason, actor.userId);
    } catch (err) {
      if (err instanceof RecordChangeError) {
        if (err.code === 'record_not_found') throw notFound(err.code, err.message);
        throw new Problem(409, err.code, 'Record already changed', err.message);
      }
      throw err;
    }
    return { observationId, state: 'withdrawn' };
  }
}
