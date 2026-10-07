import { Module } from '@nestjs/common';
import { ObservationsModule } from '../obs/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { IngestionController } from './ingestion.controller.js';
import { IngestionService } from './ingestion.service.js';
import { SourcesRepository } from './sources.repository.js';

@Module({
  imports: [VehicleModule, ObservationsModule],
  controllers: [IngestionController],
  providers: [SourcesRepository, IngestionService],
  exports: [IngestionService],
})
export class IngestModule {}
