import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { NotifyModule } from '../notify/index.js';
import { ObservationsModule } from '../obs/index.js';
import { TrustModule } from '../trust/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { AttestController } from './attest.controller.js';
import { GarageController } from './garage.controller.js';
import { GarageRepository } from './garage.repository.js';
import { GarageService } from './garage.service.js';

@Module({
  imports: [IamModule, NotifyModule, VehicleModule, ObservationsModule, IngestModule, TrustModule],
  controllers: [GarageController, AttestController],
  providers: [GarageRepository, GarageService],
  exports: [GarageService],
})
export class GarageModule {}
