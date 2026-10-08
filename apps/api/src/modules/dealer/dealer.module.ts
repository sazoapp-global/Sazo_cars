import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { ReportModule } from '../report/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { DealerController } from './dealer.controller.js';
import { DealerRepository } from './dealer.repository.js';
import { DealerService } from './dealer.service.js';

@Module({
  imports: [IamModule, VehicleModule, IngestModule, ReportModule],
  controllers: [DealerController],
  providers: [DealerRepository, DealerService],
})
export class DealerModule {}
