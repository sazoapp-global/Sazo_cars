// What the partner console needs: the sources the signed-in person may submit for, and their history.
import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { notFound } from '../../platform/problem.js';
import { canForOrg, CurrentActor, type Actor } from '../iam/index.js';
import { IngestionService } from './ingestion.service.js';

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
}
