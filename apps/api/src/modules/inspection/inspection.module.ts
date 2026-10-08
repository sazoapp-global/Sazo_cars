import { Module } from '@nestjs/common';
import { GarageModule } from '../garage/index.js';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { ObservationsModule } from '../obs/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { InspectionController } from './inspection.controller.js';
import { InspectionRepository } from './inspection.repository.js';
import { InspectionService } from './inspection.service.js';

@Module({
  imports: [IamModule, VehicleModule, ObservationsModule, IngestModule, GarageModule],
  controllers: [InspectionController],
  providers: [InspectionRepository, InspectionService],
})
export class InspectionModule {}
