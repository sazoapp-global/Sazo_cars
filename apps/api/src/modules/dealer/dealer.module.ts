import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { NotifyModule } from '../notify/index.js';
import { ObservationsModule } from '../obs/index.js';
import { ReferenceModule } from '../ref/index.js';
import { ReportModule } from '../report/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { DealerController } from './dealer.controller.js';
import { DealerRepository } from './dealer.repository.js';
import { DealerService } from './dealer.service.js';
import { DealerImportService } from './import.service.js';
import { ForSaleController } from './for-sale.controller.js';
import { AdminBrokersController, BrokerController } from './broker.controller.js';
import { BrokerService } from './broker.service.js';
import { DealerCommissionsController, PublicCarController, SellingController } from './selling.controller.js';
import { SellingRepository } from './selling.repository.js';
import { SellingService } from './selling.service.js';
import { DealerDashboardService } from './dashboard.service.js';
import { DealerPaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [IamModule, VehicleModule, IngestModule, ReportModule, ObservationsModule, NotifyModule, ReferenceModule],
  controllers: [DealerController, ForSaleController, SellingController, DealerCommissionsController, PublicCarController, BrokerController, AdminBrokersController, DealerPaymentsController],
  providers: [DealerRepository, DealerService, DealerImportService, SellingRepository, SellingService, BrokerService, PaymentsService, DealerDashboardService],
  exports: [PaymentsService],
})
export class DealerModule {}
