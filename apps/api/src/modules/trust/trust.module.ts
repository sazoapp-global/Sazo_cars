import { Module } from '@nestjs/common';
import { IamModule } from '../iam/index.js';
import { IngestModule } from '../ingest/index.js';
import { ObservationsModule } from '../obs/index.js';
import { ReferenceModule } from '../ref/index.js';
import { VehicleModule } from '../vehicle/index.js';
import { TrustAdminController } from './admin.controller.js';
import { ConflictsService } from './conflicts.service.js';
import { TrustService } from './trust.service.js';

@Module({
  imports: [IamModule, VehicleModule, ObservationsModule, IngestModule, ReferenceModule],
  controllers: [TrustAdminController],
  providers: [TrustService, ConflictsService],
  exports: [TrustService],
})
export class TrustModule {}
