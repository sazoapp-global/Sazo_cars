import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/index.js';
import { ObservationsModule } from '../obs/index.js';
import { ReferenceModule } from '../ref/index.js';
import { TrustModule } from '../trust/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [VehicleModule, ObservationsModule, IngestModule, TrustModule, ReferenceModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportModule {}
