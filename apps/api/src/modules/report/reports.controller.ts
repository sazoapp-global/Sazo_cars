import { Controller, Get, Inject, Param } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { Problem, notFound } from '../../platform/problem.js';
import { ReportNotFound, ReportsService } from './reports.service.js';

const REF = /^SZV-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

@Controller('vehicles')
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  private async run<T>(ref: string, fn: () => Promise<T>): Promise<T> {
    if (!REF.test(ref)) throw notFound('vehicle_not_found', 'No such vehicle');
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ReportNotFound) throw notFound('vehicle_not_found', 'No such vehicle');
      throw err;
    }
  }

  /** Signed-in views. Until sign-in exists (module 1), they are only served outside production. */
  private requireSignIn(): void {
    if (this.cfg.NODE_ENV === 'production') {
      throw new Problem(401, 'authentication_required', 'Unauthorized', 'Sign in to see the full report');
    }
  }

  /** GET /v1/vehicles/:ref/summary — public (operationId getPublicSummary). */
  @Get(':ref/summary')
  summary(@Param('ref') ref: string) {
    return this.run(ref, () => this.reports.publicSummary(ref));
  }

  /** GET /v1/vehicles/:ref/report — operationId getFullReport. */
  @Get(':ref/report')
  report(@Param('ref') ref: string) {
    this.requireSignIn();
    return this.run(ref, () => this.reports.fullReport(ref));
  }

  /** GET /v1/vehicles/:ref/timeline — operationId getTimeline. */
  @Get(':ref/timeline')
  timeline(@Param('ref') ref: string) {
    this.requireSignIn();
    return this.run(ref, () => this.reports.timeline(ref));
  }

  /** GET /v1/vehicles/:ref/evidence — operationId getEvidenceLedger. */
  @Get(':ref/evidence')
  evidence(@Param('ref') ref: string) {
    this.requireSignIn();
    return this.run(ref, () => this.reports.evidenceLedger(ref));
  }
}
