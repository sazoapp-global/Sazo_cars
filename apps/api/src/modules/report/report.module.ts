import { Module } from '@nestjs/common';
import { ConcernModule } from '../concern/index.js';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { NotifyModule } from '../notify/index.js';
import { ObservationsModule } from '../obs/index.js';
import { ReferenceModule } from '../ref/index.js';
import { TrustModule } from '../trust/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { BuyerController } from './buyer.controller.js';
import { BuyerService } from './buyer.service.js';
import { OwnershipController } from './ownership.controller.js';
import { OwnershipService } from './ownership.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [IamModule, ConcernModule, NotifyModule, VehicleModule, ObservationsModule, IngestModule, TrustModule, ReferenceModule],
  controllers: [ReportsController, BuyerController, OwnershipController],
  providers: [ReportsService, BuyerService, OwnershipService],
  exports: [ReportsService, OwnershipService, BuyerService],
})
export class ReportModule {}
