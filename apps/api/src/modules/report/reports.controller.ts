import { Controller, Get, Inject, Param } from '@nestjs/common';
import { notFound } from '../../platform/problem.js';
import { Public, RequirePermission } from '../iam/index.js';
import { ReportNotFound, ReportsService } from './reports.service.js';

const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

@Controller('vehicles')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

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
