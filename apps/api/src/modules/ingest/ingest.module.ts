import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { ObservationsModule } from '../obs/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { IngestAdminController } from './admin.controller.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { SourcesRepository } from './sources.repository.js';

@Module({
  imports: [IamModule, VehicleModule, ObservationsModule],
  controllers: [IngestionController, IngestAdminController],
  providers: [SourcesRepository, IngestionService],
  exports: [IngestionService],
})
export class IngestModule {}
