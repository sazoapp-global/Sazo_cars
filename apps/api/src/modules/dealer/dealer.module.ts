import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { ObservationsModule } from '../obs/index.js';
import { ReportModule } from '../report/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { DealerController } from './dealer.controller.js';
import { DealerRepository } from './dealer.repository.js';
import { DealerService } from './dealer.service.js';
import { ForSaleController } from './for-sale.controller.js';
import { AdminBrokersController, BrokerController } from './broker.controller.js';
import { BrokerService } from './broker.service.js';
import { DealerCommissionsController, PublicCarController, SellingController } from './selling.controller.js';
import { SellingRepository } from './selling.repository.js';
import { SellingService } from './selling.service.js';

@Module({
  imports: [IamModule, VehicleModule, IngestModule, ReportModule, ObservationsModule],
  controllers: [DealerController, ForSaleController, SellingController, DealerCommissionsController, PublicCarController, BrokerController, AdminBrokersController],
  providers: [DealerRepository, DealerService, SellingRepository, SellingService, BrokerService],
})
export class DealerModule {}
