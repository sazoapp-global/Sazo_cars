import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { badRequest, notFound } from '../../platform/problem.js';
import { VehicleRegistry } from '../vehicle/index.js';
import { Public, RequirePermission } from '../iam/index.js';
import { ReportNotFound, ReportsService } from './reports.service.js';

const SearchQuery = z.object({ q: z.string().trim().min(4).max(32) });
const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

@Controller('vehicles')
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(VehicleRegistry) private readonly registry: VehicleRegistry,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  /** GET /v1/vehicles/search?q= — operationId searchVehicles. Never silently picks one car when several match. */
  @Public()
  @Get('search')
  async search(@Query() query: Record<string, unknown>) {
    const parsed = SearchQuery.safeParse(query);
    if (!parsed.success) throw badRequest('invalid_query', 'q must be 4–32 characters (a VIN, chassis number or plate)');
    const result = await this.registry.search(parsed.data.q);
    const [matches, suggestionMatch] = await Promise.all([
      this.reports.enrichCards(result.matches),
      result.suggestion ? this.reports.enrichCards([result.suggestion.match]) : Promise.resolve([]),
    ]);
    return {
      ...result,
      matches,
      suggestion: result.suggestion ? { ...result.suggestion, match: suggestionMatch[0] } : null,
      simulatedDataNotice: this.cfg.SIMULATED_DATA,
    };
  }

  private async run<T>(ref: string, fn: () => Promise<T>): Promise<T> {
    if (!REF.test(ref)) throw notFound('vehicle_not_found', 'No such vehicle');
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ReportNotFound) throw notFound('vehicle_not_found', 'No such vehicle');
      throw err;
    }
  }

  /** GET /v1/vehicles/:ref/summary — public (operationId getPublicSummary). */
  @Public()
  @Get(':ref/summary')
  summary(@Param('ref') ref: string) {
    return this.run(ref, () => this.reports.publicSummary(ref));
  }

  /** GET /v1/vehicles/:ref/report — operationId getFullReport. */
  @Get(':ref/report')
  @RequirePermission('vehicle.report.full.read')
  report(@Param('ref') ref: string) {
    return this.run(ref, () => this.reports.fullReport(ref));
  }

  /** GET /v1/vehicles/:ref/timeline — operationId getTimeline. */
  @Get(':ref/timeline')
  @RequirePermission('vehicle.report.full.read')
  timeline(@Param('ref') ref: string) {
    return this.run(ref, () => this.reports.timeline(ref));
  }

  /** GET /v1/vehicles/:ref/evidence — operationId getEvidenceLedger. */
  @Get(':ref/evidence')
  @RequirePermission('vehicle.report.full.read')
  evidence(@Param('ref') ref: string) {
    return this.run(ref, () => this.reports.evidenceLedger(ref));
  }
}
