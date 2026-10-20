import { Module } from '@nestjs/common';
import { GarageModule } from '../garage/index.js';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { NotifyModule } from '../notify/index.js';
import { ObservationsModule } from '../obs/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { CarPhotosController } from './car-photos.controller.js';
import { InspectionController } from './inspection.controller.js';
import { InspectionRepository } from './inspection.repository.js';
import { InspectionService } from './inspection.service.js';

@Module({
  imports: [IamModule, VehicleModule, ObservationsModule, IngestModule, GarageModule, NotifyModule],
  controllers: [InspectionController, CarPhotosController, BookingsController],
  providers: [InspectionRepository, InspectionService, BookingsService],
})
export class InspectionModule {}
